import { describe, expect, it } from 'vitest'
import type { Food, Nutrient, Recipe, Serving } from './model'
import { localSource, normalizeNutrient, snapshotFood, snapshotRecipe, sumNutrients } from './nutrition'
import { decimal, isLocalDate, numberLabel } from './dates'

const energy = (value: number, unit: Nutrient['unit'] = 'kcal'): Nutrient => ({ id: 'energy', value, unit, source: localSource })
const food: Food = {
  id: 'food', name: 'Surovina', source: localSource, preparationState: 'raw',
  nutrition: { basis: { value: 100, unit: 'g' }, nutrients: [
    energy(200),
    { id: 'fiber', value: 0, unit: 'g', source: localSource },
    { id: 'salt', value: 0.5, unit: 'g', source: localSource },
    { id: 'vitaminC', value: null, unit: 'mg', source: localSource },
  ] },
}
const piece: Serving = {
  id: 'piece', foodId: food.id, label: 'Kus', unit: 'piece',
  conversion: { kind: 'mass', grams: 50 },
}
const serving: Serving = {
  id: 'serving', foodId: food.id, label: 'Porcia', unit: 'serving', estimated: true,
  conversion: { kind: 'volume', millilitres: 30 },
}

describe('nutričné výpočty', () => {
  it('prepočíta 150 g na 300 kcal, zachová nulu a null a doplní prevod soli', () => {
    const snapshot = snapshotFood(food, { value: 150, unit: 'g' }, [])
    expect(snapshot.nutrients).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'energy', unit: 'kcal', value: 300 }),
      expect.objectContaining({ id: 'fiber', value: 0 }),
      expect.objectContaining({ id: 'vitaminC', value: null }),
      expect.objectContaining({ id: 'salt', unit: 'g', value: 0.75 }),
      expect.objectContaining({ id: 'sodium', unit: 'mg', value: 300 }),
    ]))
  })

  it('prepočíta ml, kusy a pomenované porcie iba so zadaným pravidlom prevodu', () => {
    const dense = { ...food, density: { gramsPerMillilitre: 1.2, estimated: true } }
    expect(snapshotFood(dense, { value: 125, unit: 'ml' }, []).amount).toEqual({ unit: 'g', value: 150, estimated: true })
    expect(snapshotFood(food, { value: 2, unit: 'piece', servingId: piece.id }, [piece]).nutrients[0]?.value).toBe(200)
    expect(snapshotFood(dense, { value: 2, unit: 'serving', servingId: serving.id }, [serving]).amount)
      .toEqual({ unit: 'g', value: 72, estimated: true })
    expect(() => snapshotFood(food, { value: 125, unit: 'ml' }, [])).toThrow('hustotu')
    expect(() => snapshotFood(food, { value: 2, unit: 'serving', servingId: piece.id }, [piece])).toThrow('porcie')

    const liquid: Food = { ...food, nutrition: { basis: { value: 250, unit: 'ml' }, nutrients: [energy(38)] } }
    expect(snapshotFood(liquid, { value: 125, unit: 'ml' }, []).nutrients[0]?.value).toBe(19)
  })

  it('normalizuje kJ, g/mg/µg a jednotky vitamínu D bez zaokrúhlenia pri výpočte', () => {
    const converted = normalizeNutrient(energy(418.4, 'kJ'))
    expect(converted.unit).toBe('kcal')
    expect(converted.value).toBeCloseTo(100, 12)
    expect(numberLabel(converted.value!)).toBe('100')
    expect(normalizeNutrient({ id: 'vitaminD', unit: 'IU', value: 400, source: localSource }))
      .toMatchObject({ unit: 'µg', value: 10 })
    expect(normalizeNutrient({ id: 'iron', unit: 'g', value: 0.00425, source: localSource }))
      .toMatchObject({ unit: 'mg', value: 4.25 })
    expect(normalizeNutrient({ id: 'vitaminA', unit: 'IU', value: 400, source: localSource }))
      .toMatchObject({ unit: 'IU', value: 400 })
    expect(decimal(' 0,125 ', 'Množstvo')).toBe(0.125)
    expect(decimal('', 'Množstvo')).toBeUndefined()
    expect(decimal('0', 'Vláknina', true)).toBe(0)
    expect(() => decimal('0', 'Množstvo')).toThrow()
  })

  it('počíta recept z výslednej výťažnosti a označí neúplný údaj surovín', () => {
    const other: Food = {
      id: 'other', name: 'Iná surovina', source: { kind: 'usda', externalId: 'test' }, preparationState: 'cooked',
      nutrition: { basis: { value: 100, unit: 'g' }, nutrients: [energy(75), { id: 'vitaminC', value: 8, unit: 'mg', source: localSource }] },
    }
    const recipe: Recipe = {
      id: 'recipe', name: 'Recept', yield: { servings: 2, weightGrams: 120 },
      ingredients: [
        { foodId: food.id, amount: { unit: 'g', value: 100 }, preparationState: 'raw' },
        { foodId: other.id, amount: { unit: 'g', value: 40 }, preparationState: 'cooked' },
      ],
    }
    const portion = snapshotRecipe(recipe, { unit: 'serving', value: 1, servingId: recipe.id }, [food, other], [])
    expect(portion.amount).toMatchObject({ unit: 'g', value: 60 })
    expect(portion.nutrients).toContainEqual(expect.objectContaining({ id: 'energy', value: 115 }))
    expect(portion.nutrients).toContainEqual(expect.objectContaining({
      id: 'vitaminC', value: 1.6, coverage: { known: 1, total: 2 },
    }))
    expect(portion.sources).toEqual(expect.arrayContaining([localSource, other.source]))
    expect(snapshotRecipe({ ...recipe, yield: { servings: 2 } }, { unit: 'serving', value: 1, servingId: recipe.id }, [food, other], []).amount)
      .toMatchObject({ value: 1, unit: 'serving' })
    expect(() => snapshotRecipe(recipe, { unit: 'g', value: 60 }, [food, { ...other, preparationState: 'raw' }], []))
      .toThrow('stav suroviny')

    const day = sumNutrients([snapshotFood(food, { unit: 'g', value: 150 }, []), portion], true)
    expect(day).toContainEqual(expect.objectContaining({ id: 'energy', value: 415, known: 2, total: 2, partial: false }))
    expect(day).toContainEqual(expect.objectContaining({ id: 'vitaminC', value: 1.6, known: 1, total: 2, partial: true }))
    expect(day).toContainEqual(expect.objectContaining({ id: 'protein', value: null, known: 0, total: 2 }))
  })

  it('overuje miestne kalendárne dátumy bez normalizácie neexistujúceho dňa', () => {
    expect(isLocalDate('2024-02-29')).toBe(true)
    expect(isLocalDate('2026-02-29')).toBe(false)
    expect(isLocalDate('2026-11-23T00:00:00Z')).toBe(false)
  })
})
