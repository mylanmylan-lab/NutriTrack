import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { NutriTrackDatabase, SCHEMA_VERSION } from './database'
import type { Food, MealEntry, Preferences } from './model'

const databases: Dexie[] = []
const date = '2026-11-23'
const source = { kind: 'local' } as const
const food: Food = {
  id: 'oats',
  name: 'Ovsené vločky',
  source,
  nutrition: { basis: { value: 100, unit: 'g' }, nutrients: [] },
}
const entry: MealEntry = {
  id: 'breakfast-oats',
  date,
  time: '08:00',
  categoryId: 'breakfast',
  item: { type: 'food', id: food.id },
  amount: { value: 50, unit: 'g' },
  snapshot: {
    name: food.name,
    amount: { value: 50, unit: 'g', estimated: false },
    nutrients: [{ id: 'vitaminC', unit: 'mg', value: null, source }],
    sources: [source],
  },
}

function openTestDatabase() {
  const database = new NutriTrackDatabase(crypto.randomUUID())
  databases.push(database)
  return database
}

afterEach(async () => {
  for (const database of databases.splice(0)) {
    await database.delete()
  }
})

describe('schéma IndexedDB', () => {
  it('vytvorí prázdnu databázu v aktuálnej verzii', async () => {
    const database = openTestDatabase()
    await database.open()

    expect(database.verno).toBe(SCHEMA_VERSION)
    expect(database.tables.map(({ name }) => name).sort()).toEqual([
      'activities',
      'bodyMeasurements',
      'foods',
      'goals',
      'journalDays',
      'lastServings',
      'mealCategories',
      'mealCombinations',
      'mealEntries',
      'preferences',
      'profiles',
      'recipes',
      'servings',
    ])
    expect(await database.mealEntries.count()).toBe(0)
    expect(await database.preferences.count()).toBe(0)
  })

  it('pri aktualizácii z verzie 1 zachová záznamy a sprístupní nové indexy a tabuľky', async () => {
    const database = openTestDatabase()
    const previousVersion = new Dexie(database.name)
    previousVersion.version(1).stores({
      profiles: 'id',
      preferences: 'id',
      foods: 'id, name, brand, barcode, source.kind',
      servings: 'id, foodId',
      recipes: 'id, name',
      mealCategories: 'id, order',
      mealEntries: 'id, date, categoryId',
      bodyMeasurements: 'id, date',
      activities: 'id, date',
      goals: 'id, validFrom',
    })

    const preferences: Preferences = { id: 'local', theme: 'system' }
    try {
      await previousVersion.open()
      await previousVersion.table<Preferences>('preferences').add(preferences)
      await previousVersion.table<Food>('foods').add(food)
      await previousVersion.table<MealEntry>('mealEntries').add(entry)
    } finally {
      previousVersion.close()
    }

    await database.open()

    expect(database.verno).toBe(SCHEMA_VERSION)
    expect(await database.preferences.get('local')).toEqual(preferences)
    expect(await database.foods.get(food.id)).toEqual(food)
    expect(await database.mealEntries.where('[date+categoryId]').equals([date, 'breakfast']).first())
      .toEqual(entry)

    await database.journalDays.add({ date, completeness: 'complete' })
    await database.lastServings.add({ foodId: food.id, amount: entry.amount, usedAt: '2026-11-23T07:00:00Z' })
    expect(await database.journalDays.get(date)).toMatchObject({ completeness: 'complete' })
    expect(await database.lastServings.get(food.id)).toMatchObject({ amount: entry.amount })
  })

  it('otvorí starú schému 2 a zachová denník, porcie aj označenie dňa', async () => {
    const database = openTestDatabase()
    const previous = new Dexie(database.name)
    previous.version(2).stores({
      profiles: 'id', preferences: 'id', foods: 'id, name, brand, barcode, source.kind',
      servings: 'id, foodId', recipes: 'id, name', mealCategories: 'id, order',
      mealEntries: 'id, date, categoryId, [date+categoryId]', bodyMeasurements: 'id, date',
      activities: 'id, date', goals: 'id, validFrom', journalDays: 'date', lastServings: 'foodId',
    })
    const remembered = { foodId: food.id, amount: entry.amount, usedAt: '2026-11-23T07:00:00Z' }
    const day = { date, completeness: 'complete' }
    try {
      await previous.open()
      await previous.table('foods').add(food)
      await previous.table('mealEntries').add(entry)
      await previous.table('lastServings').add(remembered)
      await previous.table('journalDays').add(day)
    } finally {
      previous.close()
    }
    await database.open()
    expect(database.verno).toBe(SCHEMA_VERSION)
    expect(await database.foods.get(food.id)).toEqual(food)
    expect(await database.mealEntries.get(entry.id)).toEqual(entry)
    expect(await database.lastServings.get(food.id)).toEqual(remembered)
    expect(await database.journalDays.get(date)).toEqual(day)
    expect(await database.mealCombinations.count()).toBe(0)
  })

  it('pri prechode zo schémy 3 doplní časový index a zachová kontext i kombinácie', async () => {
    const database = openTestDatabase()
    const previous = new Dexie(database.name)
    previous.version(3).stores({
      profiles: 'id', preferences: 'id', foods: 'id, name, brand, barcode, source.kind',
      servings: 'id, foodId', recipes: 'id, name', mealCategories: 'id, order',
      mealEntries: 'id, date, categoryId, [date+categoryId]', bodyMeasurements: 'id, date',
      activities: 'id, date', goals: 'id, validFrom', journalDays: 'date', lastServings: 'foodId',
      mealCombinations: 'id, name',
    })
    const recorded: MealEntry = { ...entry, context: ['hunger', 'rest'] }
    const combination = { id: 'combo', name: 'Kombinácia', categoryId: entry.categoryId, items: [{ item: entry.item, amount: entry.amount }] }
    try {
      await previous.open()
      await previous.table('foods').add(food)
      await previous.table('mealEntries').add(recorded)
      await previous.table('mealCombinations').add(combination)
    } finally {
      previous.close()
    }
    await database.open()
    expect(database.verno).toBe(4)
    expect(await database.mealEntries.where('[date+time]').equals([date, recorded.time]).first()).toEqual(recorded)
    expect(await database.mealCombinations.get('combo')).toEqual(combination)
  })

  it('uchová historickú snímku s chýbajúcou hodnotou aj po zmene potraviny a opätovnom otvorení', async () => {
    const database = openTestDatabase()

    await database.foods.add(food)
    await database.mealEntries.add(entry)
    await database.foods.update(food.id, {
      name: 'Vločky',
      nutrition: {
        basis: { value: 100, unit: 'g' },
        nutrients: [{ id: 'vitaminC', unit: 'mg', value: 4, source }],
      },
    })
    database.close()
    await database.open()

    expect(await database.mealEntries.get(entry.id)).toEqual(entry)
    expect((await database.foods.get(food.id))?.name).toBe('Vločky')
  })
})
