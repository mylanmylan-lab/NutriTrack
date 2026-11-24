import foundationFoods from './foundationFoods.json'
import type { Food, FoodSource } from './model'
import { nutrientDefinitions } from './nutrition'

export const foundationRelease = 'Foundation Foods 2026-10-29'

export const basicFoods: Food[] = foundationFoods.map((record) => {
  const externalId = String(record.fdcId)
  const source: FoodSource = { kind: 'usda', externalId, version: foundationRelease }
  const values: Record<string, number | undefined> = record.nutrients
  const preparationState = record.preparationState
  return {
    id: `usda:${externalId}`,
    name: record.name,
    source,
    ...(preparationState === 'raw' || preparationState === 'cooked' ? { preparationState } : {}),
    nutrition: {
      basis: { value: 100, unit: 'g' },
      nutrients: nutrientDefinitions.map(([id, , unit]) => ({ id, unit, value: values[id] ?? null, source })),
    },
  }
})
