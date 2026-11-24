import type {
  Food, FoodSource, MealNutritionSnapshot, Nutrient, NutrientUnit, PortionAmount,
  Recipe, ResolvedAmount, Serving,
} from './model'

export const packageFractions = [
  { id: 'package:1:4', label: '1/4 balenia', numerator: 1, denominator: 4 },
  { id: 'package:1:3', label: '1/3 balenia', numerator: 1, denominator: 3 },
  { id: 'package:1:2', label: '1/2 balenia', numerator: 1, denominator: 2 },
  { id: 'package:1:1', label: 'Celé balenie', numerator: 1, denominator: 1 },
] as const

export const localSource = { kind: 'local' } as const

export const nutrientDefinitions: ReadonlyArray<readonly [string, string, NutrientUnit]> = [
  ['energy', 'Energia', 'kcal'],
  ['protein', 'Bielkoviny', 'g'],
  ['carbohydrates', 'Sacharidy', 'g'],
  ['fat', 'Tuky', 'g'],
  ['fiber', 'Vláknina', 'g'],
  ['sugars', 'Cukry', 'g'],
  ['saturatedFat', 'Nasýtené tuky', 'g'],
  ['sodium', 'Sodík', 'mg'],
  ['salt', 'Soľ', 'g'],
  ['addedSugars', 'Pridané cukry', 'g'],
  ['transFat', 'Transmastné kyseliny', 'g'],
  ['monounsaturatedFat', 'Mononenasýtené tuky', 'g'],
  ['polyunsaturatedFat', 'Polynenasýtené tuky', 'g'],
  ['cholesterol', 'Cholesterol', 'mg'],
  ['vitaminA', 'Vitamín A', 'µg'],
  ['vitaminB1', 'Vitamín B1', 'mg'],
  ['vitaminB2', 'Vitamín B2', 'mg'],
  ['vitaminB3', 'Vitamín B3', 'mg'],
  ['vitaminB5', 'Vitamín B5', 'mg'],
  ['vitaminB6', 'Vitamín B6', 'mg'],
  ['vitaminB7', 'Biotín (B7)', 'µg'],
  ['vitaminB9', 'Folát (B9)', 'µg'],
  ['vitaminB12', 'Vitamín B12', 'µg'],
  ['vitaminC', 'Vitamín C', 'mg'],
  ['vitaminD', 'Vitamín D', 'µg'],
  ['vitaminE', 'Vitamín E', 'mg'],
  ['vitaminK', 'Vitamín K', 'µg'],
  ['choline', 'Cholín', 'mg'],
  ['calcium', 'Vápnik', 'mg'],
  ['iron', 'Železo', 'mg'],
  ['magnesium', 'Horčík', 'mg'],
  ['phosphorus', 'Fosfor', 'mg'],
  ['potassium', 'Draslík', 'mg'],
  ['zinc', 'Zinok', 'mg'],
  ['copper', 'Meď', 'mg'],
  ['manganese', 'Mangán', 'mg'],
  ['selenium', 'Selén', 'µg'],
  ['iodine', 'Jód', 'µg'],
  ['fluoride', 'Fluorid', 'mg'],
  ['chromium', 'Chróm', 'µg'],
  ['molybdenum', 'Molybdén', 'µg'],
  ['chloride', 'Chlorid', 'mg'],
]

const definitions = new Map(nutrientDefinitions.map((definition) => [definition[0], definition]))
const massInGrams: Partial<Record<NutrientUnit, number>> = { g: 1, mg: 1e-3, 'µg': 1e-6 }

export function nutrientLabel(id: string) {
  return definitions.get(id)?.[1] ?? id
}

export function acceptedUnits(unit: NutrientUnit, id: string): NutrientUnit[] {
  if (unit === 'kcal') return ['kcal', 'kJ']
  const units = [unit, ...(['g', 'mg', 'µg'] as const).filter((candidate) => candidate !== unit)]
  if (id === 'vitaminA' || id === 'vitaminD' || id === 'vitaminE') units.push('IU')
  return units
}

export function normalizeNutrient(nutrient: Nutrient): Nutrient {
  const unit = definitions.get(nutrient.id)?.[2]
  if (!unit || unit === nutrient.unit) return nutrient
  const sourceMass = massInGrams[nutrient.unit]
  const targetMass = massInGrams[unit]
  const factor = sourceMass && targetMass ? sourceMass / targetMass
    : unit === 'kcal' && nutrient.unit === 'kJ' ? 1 / 4.184
    : nutrient.id === 'vitaminD' && nutrient.unit === 'IU' ? 0.025
    : undefined
  if (factor === undefined) return nutrient
  return { ...nutrient, unit, value: nutrient.value === null ? null : nutrient.value * factor }
}

function positive(value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Množstvo musí byť kladné číslo.')
  return value
}

function fromPackage(food: Food, numerator: number, denominator: number): ResolvedAmount {
  if (!food.package) throw new Error('Potravina nemá zadanú veľkosť balenia.')
  return { ...food.package, value: positive(food.package.value * positive(numerator) / positive(denominator)), estimated: false }
}

export function amountValue(amount: PortionAmount) {
  return amount.unit === 'packageFraction' ? positive(amount.numerator) / positive(amount.denominator) : positive(amount.value)
}

export function resolveFoodAmount(food: Food, amount: PortionAmount, servings: readonly Serving[]): ResolvedAmount {
  let resolved: ResolvedAmount
  if (amount.unit === 'packageFraction') {
    resolved = fromPackage(food, amount.numerator, amount.denominator)
  } else if ('servingId' in amount) {
    const serving = servings.find(({ id, unit }) => id === amount.servingId && (!unit || unit === amount.unit))
    if (!serving || serving.foodId !== food.id) throw new Error('Vyberte platnú veľkosť porcie.')
    const rule = serving.conversion
    resolved = rule.kind === 'mass' ? { unit: 'g', value: rule.grams, estimated: false }
      : rule.kind === 'volume' ? { unit: 'ml', value: rule.millilitres, estimated: false }
      : fromPackage(food, rule.numerator, rule.denominator)
    resolved.value *= amountValue(amount)
    resolved.estimated = serving.estimated ?? false
  } else {
    resolved = { ...amount, estimated: false }
  }

  const basis = food.nutrition.basis
  if (resolved.unit === basis.unit) return { ...resolved, value: positive(resolved.value) }

  if (!food.density) throw new Error('Prevod medzi gramami a mililitrami vyžaduje hustotu potraviny.')
  const density = positive(food.density.gramsPerMillilitre)
  return {
    unit: basis.unit,
    value: positive(basis.unit === 'g' ? resolved.value * density : resolved.value / density),
    estimated: resolved.estimated || food.density.estimated,
  }
}

function multiply(nutrient: Nutrient, factor: number): Nutrient {
  if (nutrient.value === null) return { ...nutrient }
  const value = nutrient.value * factor
  if (!Number.isFinite(value) || value < 0) throw new Error('Nutričná hodnota je mimo rozsahu.')
  return { ...nutrient, value }
}

function withSodiumAndSalt(nutrients: Nutrient[]) {
  const sodium = nutrients.find(({ id, unit }) => id === 'sodium' && unit === 'mg')
  const salt = nutrients.find(({ id, unit }) => id === 'salt' && unit === 'g')
  const sodiumValue = sodium?.value ?? null
  const saltValue = salt?.value ?? null
  if (sodiumValue === null && salt && saltValue !== null) {
    const { value, source, coverage } = multiply(salt, 400)
    return [...nutrients.filter((item) => item !== sodium), { id: 'sodium', unit: 'mg' as const, value, source, ...(coverage ? { coverage } : {}) }]
  }
  if (saltValue === null && sodium && sodiumValue !== null) {
    const { value, source, coverage } = multiply(sodium, 0.0025)
    return [...nutrients.filter((item) => item !== salt), { id: 'salt', unit: 'g' as const, value, source, ...(coverage ? { coverage } : {}) }]
  }
  return nutrients
}

export function snapshotFood(food: Food, amount: PortionAmount, servings: readonly Serving[]): MealNutritionSnapshot {
  const resolved = resolveFoodAmount(food, amount, servings)
  const nutrients = withSodiumAndSalt(food.nutrition.nutrients.map(normalizeNutrient))
    .map((nutrient) => multiply(nutrient, resolved.value / positive(food.nutrition.basis.value)))
  return {
    name: food.name,
    amount: resolved,
    nutrients,
    sources: uniqueSources([food.source, ...nutrients.map(({ source }) => source)]),
  }
}

function uniqueSources(sources: FoodSource[]) {
  return [...new Map(sources.map((source) => [JSON.stringify(source), source])).values()]
}

export interface NutrientTotal {
  id: string
  unit: NutrientUnit
  value: number | null
  known: number
  total: number
  partial: boolean
}

export function sumNutrients(snapshots: readonly MealNutritionSnapshot[], includeCore = false): NutrientTotal[] {
  const rows = new Map<string, NutrientTotal>()
  const key = (id: string, unit: NutrientUnit) => `${id}/${unit}`
  if (includeCore) {
    for (const [id, , unit] of nutrientDefinitions.slice(0, 9)) {
      rows.set(key(id, unit), { id, unit, value: null, known: 0, total: snapshots.length, partial: false })
    }
  }
  for (const snapshot of snapshots) {
    const counted = new Set<string>()
    for (const nutrient of withSodiumAndSalt(snapshot.nutrients.map(normalizeNutrient))) {
      const { id, unit, value, coverage } = nutrient
      const nutrientKey = key(id, unit)
      const row = rows.get(nutrientKey) ?? { id, unit, value: null, known: 0, total: snapshots.length, partial: false }
      rows.set(nutrientKey, row)
      if (value === null || counted.has(nutrientKey)) continue
      counted.add(nutrientKey)
      row.value = (row.value ?? 0) + value
      row.known += 1
      row.partial ||= Boolean(coverage && coverage.known < coverage.total)
    }
  }
  return [...rows.values()].map((row) => ({ ...row, partial: row.partial || row.known < row.total }))
}

export function snapshotRecipe(
  recipe: Recipe, amount: PortionAmount, foods: readonly Food[], servings: readonly Serving[],
): MealNutritionSnapshot {
  const ingredients = recipe.ingredients.map((ingredient) => {
    const food = foods.find(({ id }) => id === ingredient.foodId)
    if (!food) throw new Error('Jedna zo surovín receptu už nie je dostupná.')
    if (food.preparationState && ingredient.preparationState !== food.preparationState) {
      throw new Error(`Skontrolujte stav suroviny „${food.name}“ v recepte.`)
    }
    return snapshotFood(food, ingredient.amount, servings)
  })
  if (!ingredients.length) throw new Error('Recept musí obsahovať aspoň jednu surovinu.')

  let ratio: number
  let resolved: MealNutritionSnapshot['amount']
  if (amount.unit === 'g' && recipe.yield.weightGrams !== undefined) {
    ratio = amountValue(amount) / positive(recipe.yield.weightGrams)
    resolved = { value: amount.value, unit: 'g', estimated: false }
  } else if (amount.unit === 'serving' && amount.servingId === recipe.id && recipe.yield.servings !== undefined) {
    ratio = amountValue(amount) / positive(recipe.yield.servings)
    resolved = recipe.yield.weightGrams === undefined
      ? { value: amount.value, unit: 'serving', estimated: false }
      : { value: positive(recipe.yield.weightGrams * ratio), unit: 'g', estimated: false }
  } else {
    throw new Error('Množstvo sa musí zhodovať s výťažnosťou receptu.')
  }
  resolved.estimated ||= ingredients.some((ingredient) => ingredient.amount.estimated)

  const nutrients = sumNutrients(ingredients).map(({ id, unit, value, known, total }) =>
    multiply({ id, unit, value, source: localSource, coverage: { known, total } }, ratio),
  )
  return {
    name: recipe.name, amount: resolved, nutrients, sources: uniqueSources(ingredients.flatMap(({ sources }) => sources)),
  }
}

export function resizeSnapshot(snapshot: MealNutritionSnapshot, oldAmount: PortionAmount, nextAmount: PortionAmount) {
  const ratio = amountValue(nextAmount) / amountValue(oldAmount)
  if (ratio === 1) return snapshot
  return {
    ...snapshot,
    amount: { ...snapshot.amount, value: positive(snapshot.amount.value * ratio) },
    nutrients: snapshot.nutrients.map((nutrient) => multiply(nutrient, ratio)),
  } satisfies MealNutritionSnapshot
}
