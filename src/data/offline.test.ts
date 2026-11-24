import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { exportBackup, inspectBackup, restoreBackup } from './backup'
import { csv, daysCsv, mealsCsv, measurementsCsv } from './csv'
import { NutriTrackDatabase } from './database'
import { confirmGoal, estimateEnergy, estimateTarget, saveProfile } from './goals'
import { addCategory, copyMeal, deleteFood, editMeal, findFoodByGtin, importCatalogFood, logCombination, logMeal, matchesFood, saveCombination, saveFood, saveRecipe, toggleFavorite } from './journal'
import type { Food, Serving } from './model'
import { localSource } from './nutrition'

const opened: NutriTrackDatabase[] = []
const date = '2026-10-12'
const food: Food = {
  id: 'food', name: 'Ražný chlieb', brand: 'Pekáreň', source: localSource, preparationState: 'cooked',
  nutrition: { basis: { unit: 'g', value: 100 }, nutrients: [{ id: 'energy', value: 200, unit: 'kcal', source: localSource }] },
}
const serving: Serving = { id: 'serving', foodId: food.id, label: 'Krajec', unit: 'piece', conversion: { kind: 'mass', grams: 45 } }

function createDatabase() {
  const db = new NutriTrackDatabase(crypto.randomUUID())
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete()
})

async function fixture(db: NutriTrackDatabase) {
  await saveFood(db, food, [serving], false)
  const categoryId = await addCategory(db, 'Druhé raňajky')
  return logMeal(db, {
    item: { type: 'food', id: food.id }, amount: { unit: 'piece', value: 2, servingId: serving.id },
    date, time: '09:30', categoryId,
  })
}

describe('offline úložisko', () => {
  it('uchováva poslednú porciu a historickú snímku pri úprave, kopírovaní aj zmazaní potraviny', async () => {
    const db = createDatabase()
    const id = await fixture(db)
    const first = await db.mealEntries.get(id)
    expect(matchesFood(food, 'razny')).toBe(true)
    expect(matchesFood(food, 'PEKAREN')).toBe(true)
    expect(await db.lastServings.get(food.id)).toMatchObject({ amount: { unit: 'piece', value: 2, servingId: serving.id } })

    await saveFood(db, { ...food, name: 'Nový názov', nutrition: { ...food.nutrition, nutrients: [] } }, [], true)
    expect(await db.lastServings.get(food.id)).toBeUndefined()
    expect(await db.mealEntries.get(id)).toEqual(first)
    await editMeal(db, id, { date, time: '10:00', categoryId: 'lunch' }, 3)
    expect(await db.mealEntries.get(id)).toMatchObject({
      amount: { value: 3 }, snapshot: { name: 'Ražný chlieb', nutrients: [{ value: 270 }] },
    })
    await copyMeal(db, id, '2026-10-13')
    await deleteFood(db, food.id)
    db.close()
    await db.open()
    expect(await db.foods.count()).toBe(0)
    const copy = await db.mealEntries.where('date').equals('2026-10-13').first()
    expect(copy?.snapshot).toEqual((await db.mealEntries.get(id))?.snapshot)
    expect(copy?.id).not.toBe(id)
  })

  it('nedovolí odstraňovať potravinu ani porciu používanú v recepte a vráti celú chybnú operáciu', async () => {
    const db = createDatabase()
    await fixture(db)
    await saveRecipe(db, {
      id: 'recipe', name: 'Jedlo', yield: { servings: 2 },
      ingredients: [{ foodId: food.id, amount: { unit: 'piece', value: 2, servingId: serving.id }, preparationState: 'cooked' }],
    }, false)
    await expect(deleteFood(db, food.id)).rejects.toThrow('recepte')
    await expect(saveFood(db, { ...food, name: 'Premenovaný' }, [], true)).rejects.toThrow('recept')
    expect(await db.foods.get(food.id)).toEqual(food)
    expect(await db.servings.toArray()).toEqual([serving])
    await expect(logMeal(db, {
      date, time: '15:00', categoryId: 'snack', item: { id: food.id, type: 'food' }, amount: { unit: 'ml', value: 100 },
    })).rejects.toThrow('hustotu')
    expect(await db.mealEntries.count()).toBe(1)
    expect(await db.lastServings.get(food.id)).toMatchObject({ amount: { unit: 'piece', value: 2 } })
  })

  it('zmení energetický cieľ až potvrdením a uchová históriu pri úprave profilu', async () => {
    const db = createDatabase()
    const profile = {
      id: 'local' as const, age: { birthDate: '1996-01-01' }, formulaSex: 'female' as const,
      heightCm: 170, weightKg: 70, activityLevel: 'light' as const,
    }
    await saveProfile(db, profile)
    const tdee = estimateEnergy(profile, date)
    expect(tdee).toBeCloseTo(1995.8125)
    const target = estimateTarget(tdee!, 'lose', 0.25)
    expect(target).toBe(1721)
    expect(await db.goals.count()).toBe(0)
    await confirmGoal(db, { direction: 'lose', weeklyWeightChangeKg: 0.25, energyTargetKcal: target, calculation: 'mifflinStJeor' }, date)
    const first = (await db.profiles.get('local'))?.activeGoalId
    await saveProfile(db, { ...profile, weightKg: 69 })
    expect((await db.profiles.get('local'))?.activeGoalId).toBe(first)
    await confirmGoal(db, { direction: 'maintain', energyTargetKcal: 1950, calculation: 'manual' }, '2026-10-18')
    expect(await db.goals.get(first!)).toMatchObject({ validFrom: date, validUntil: '2026-10-18' })
    expect(await db.goals.count()).toBe(2)
  })

  it('obnoví všetky tabuľky z JSON a zachová živé údaje pri neplatnom súbore alebo chybe zápisu', async () => {
    const source = createDatabase()
    const mealId = await fixture(source)
    await saveCombination(source, 'Moje raňajky', date, (await source.mealEntries.get(mealId))!.categoryId)
    await saveRecipe(source, {
      id: 'recipe', name: 'Jedlo', yield: { weightGrams: 90 },
      ingredients: [{ foodId: food.id, amount: { unit: 'piece', value: 2, servingId: serving.id }, preparationState: 'cooked' }],
    }, false)
    await source.preferences.add({ id: 'local', theme: 'dark' })
    await source.bodyMeasurements.add({ id: 'measurement', date, weightKg: 70.25, note: 'Ráno' })
    await source.activities.add({ id: 'activity', date, type: 'Chôdza', durationMinutes: 15, accounting: 'includedInActivityLevel' })
    await source.journalDays.add({ date, completeness: 'complete' })
    await confirmGoal(source, { direction: 'maintain', energyTargetKcal: 1950, calculation: 'manual' }, date)
    const backup = await exportBackup(source)
    const destination = createDatabase()
    const preview = await inspectBackup(backup)
    expect(Object.values(preview.counts)).toEqual(Array(13).fill(1))
    await restoreBackup(destination, backup)
    for (const table of source.tables) expect(await destination.table(table.name).toArray()).toEqual(await table.toArray())

    await destination.preferences.put({ id: 'local', theme: 'light' })
    const changedBackup = backup.replace('"energyTargetKcal": 1950', '"energyTargetKcal": 1951')
    await expect(restoreBackup(destination, changedBackup)).rejects.toThrow('Kontrolný súčet')
    await expect(restoreBackup(destination, '{"format":"wrong"}')).rejects.toThrow('nezodpovedá')
    await expect(restoreBackup(destination, '{broken')).rejects.toThrow('platný JSON')

    const fail = () => { throw new Error('simulované zlyhanie zápisu') }
    destination.foods.hook('creating', fail)
    await expect(restoreBackup(destination, backup)).rejects.toThrow()
    destination.foods.hook('creating').unsubscribe(fail)
    expect(await destination.preferences.get('local')).toEqual({ id: 'local', theme: 'light' })
    expect(await destination.mealEntries.count()).toBe(1)
  })

  it('obnoví pôvodnú zálohu formátu 1 so schémou 2', async () => {
    const db = createDatabase()
    const id = await fixture(db)
    const current = JSON.parse(await exportBackup(db))
    const { mealCombinations: _, ...data } = current.data
    const older = { format: 'nutritrack', formatVersion: 1, schemaVersion: 2, exportedAt: current.exportedAt, data }
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(older)))
    const digest = Buffer.from(hash).toString('hex')
    const backup = JSON.stringify({ ...older, integrity: { algorithm: 'SHA-256', digest } })
    const restored = createDatabase()
    await restoreBackup(restored, backup)
    expect(await restored.mealEntries.get(id)).toEqual(await db.mealEntries.get(id))
    expect(await restored.mealCombinations.count()).toBe(0)
  })

  it('obnoví zálohu Etapy C vo formáte 2 s kombináciami a obľúbenými položkami', async () => {
    const db = createDatabase()
    const id = await fixture(db)
    const entry = (await db.mealEntries.get(id))!
    await saveCombination(db, 'Raňajky', entry.date, entry.categoryId)
    await toggleFavorite(db, food.id)
    const current = JSON.parse(await exportBackup(db))
    const older = { format: 'nutritrack', formatVersion: 2, schemaVersion: 3, exportedAt: current.exportedAt, data: current.data }
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(older)))
    const backup = JSON.stringify({ ...older, integrity: { algorithm: 'SHA-256', digest: Buffer.from(hash).toString('hex') } })
    const restored = createDatabase()
    await restoreBackup(restored, backup)
    expect(await restored.mealEntries.get(id)).toEqual(entry)
    expect((await restored.foods.get(food.id))?.favorite).toBe(true)
    expect(await restored.mealCombinations.count()).toBe(1)
  })

  it('aktualizuje dovoz s rovnakým GTIN, zachová obľúbenosť, ručné hodnoty a historické snímky', async () => {
    const db = createDatabase()
    const offSource = { kind: 'openFoodFacts' as const, externalId: '0036000291452', version: '1' }
    const imported: Food = {
      ...food, id: 'off:00036000291452', barcode: '0036000291452', source: offSource, package: { value: 150, unit: 'g' },
      nutrition: { ...food.nutrition, nutrients: [
        { id: 'energy', value: 200, unit: 'kcal', source: offSource },
        { id: 'protein', value: 0, unit: 'g', source: localSource },
      ] },
    }
    await importCatalogFood(db, imported)
    expect((await findFoodByGtin(db, '036000291452'))?.id).toBe(imported.id)
    await toggleFavorite(db, imported.id)
    const id = await logMeal(db, { date, time: '09:00', categoryId: 'breakfast',
      item: { type: 'food', id: imported.id }, amount: { unit: 'packageFraction', numerator: 1, denominator: 3 },
    })
    const oldSnapshot = (await db.mealEntries.get(id))?.snapshot
    expect(oldSnapshot).toMatchObject({ amount: { value: 50, unit: 'g' }, nutrients: [{ value: 100 }, { value: 0 }] })
    const updated = { ...imported, source: { ...offSource, version: '2' },
      nutrition: { ...imported.nutrition, nutrients: [{ id: 'energy', unit: 'kcal' as const, value: 400, source: offSource }] },
    }
    expect(await importCatalogFood(db, updated)).toBe(imported.id)
    expect((await db.foods.get(imported.id))?.source.version).toBe('1')
    await importCatalogFood(db, updated, imported.id)
    expect(await db.foods.get(imported.id)).toMatchObject({ favorite: true, source: { version: '2' },
      nutrition: { nutrients: [{ value: 400 }, { value: 0 }] },
    })
    expect((await db.mealEntries.get(id))?.snapshot).toEqual(oldSnapshot)
    await editMeal(db, id, { date, time: '10:00', categoryId: 'breakfast' }, { unit: 'packageFraction', numerator: 1, denominator: 2 })
    expect((await db.mealEntries.get(id))?.snapshot.nutrients[0]?.value).toBe(150)
  })

  it('zapíše kombináciu naraz aj s poslednou kategóriou a pri chybe nezapíše nič', async () => {
    const db = createDatabase()
    const id = await fixture(db)
    const entry = (await db.mealEntries.get(id))!
    await copyMeal(db, id, date)
    await saveCombination(db, 'Dvojitý zápis', date, entry.categoryId)
    const combo = (await db.mealCombinations.toArray())[0]!
    await logCombination(db, combo.id, { date, time: '18:30', categoryId: 'dinner' })
    expect(await db.mealEntries.count()).toBe(4)
    expect((await db.lastServings.get(food.id))?.categoryId).toBe('dinner')
    await expect(deleteFood(db, food.id)).rejects.toThrow('kombinácii')
    await db.mealCombinations.update(combo.id, { items: [...combo.items, { item: { type: 'food', id: 'missing' }, amount: { unit: 'g', value: 30 } }] })
    await expect(logCombination(db, combo.id, { date, time: '06:00', categoryId: 'breakfast' })).rejects.toThrow('už nie je dostupná')
    expect(await db.mealEntries.count()).toBe(4)
    expect((await db.lastServings.get(food.id))?.categoryId).toBe('dinner')
  })

  it('exportuje dátumy, jednotky, diakritiku, desatinnú čiarku a bezpečné textové bunky', async () => {
    const db = createDatabase()
    await fixture(db)
    await db.bodyMeasurements.add({ id: 'm', date, weightKg: 70.25, note: 'Ráno; meranie' })
    const meals = await mealsCsv(db)
    expect(meals).toMatch(/^\uFEFFDátum;Čas;Kategória/)
    expect(meals).toContain('2026-10-12;09:30;Druhé raňajky;Ražný chlieb;2;ks;90;g;nie;180')
    expect(await daysCsv(db)).toContain('2026-10-12;nie;Energia;180;kcal;1;1;nie')
    expect(await measurementsCsv(db)).toContain('2026-10-12;70,25;;"Ráno; meranie"\r\n')
    expect(csv([['=2+2', 'úvod "text"', null]])).toBe('\uFEFF\'=2+2;"úvod ""text""";\r\n')
  })
})
