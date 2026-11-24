import type { MealEntry, MealPattern, SnackContext } from './model'

export const contextLabels: Record<SnackContext, string> = {
  hunger: 'Hlad',
  enjoyment: 'Chuť alebo pôžitok',
  rest: 'Oddych',
  stressOrFatigue: 'Stres alebo únava',
}

export const patternLabels: Record<MealPattern, string> = {
  sweets: 'Sladkosti',
  savorySnacks: 'Slané pochutiny',
  caloricDrinks: 'Kalorické nápoje',
}

export type MealLabels = Pick<MealEntry, 'context' | 'patternTags'>

export function readMealLabels(data: FormData): MealLabels {
  return {
    context: (Object.keys(contextLabels) as SnackContext[]).filter((key) => data.getAll('context').includes(key)),
    patternTags: (Object.keys(patternLabels) as MealPattern[]).filter((key) => data.getAll('patternTags').includes(key)),
  }
}
