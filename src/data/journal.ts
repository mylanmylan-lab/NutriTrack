import type { NutriTrackDatabase } from './database'
import { isLocalDate, isLocalTime } from './dates'
import type { MealLabels } from './mealLabels'
import { equivalentGtin, validGtin } from './gtin'
import type { Food, MealCategory, MealCombination, MealEntry, PortionAmount, Recipe, Serving } from './model'
import { resolveFoodAmount, resizeSnapshot, snapshotFood, snapshotRecipe } from './nutrition'

const defaultCategories: MealCategory[] = [
  { id: 'breakfast', name: 'Raňajky', order: 0 },
  { id: 'lunch', name: 'Obed', order: 1 },
  { id: 'dinner', name: 'Večera', order: 2 },
  { id: 'snack', name: 'Občerstvenie', order: 3 },
]

export async function readCategories(db: NutriTrackDatabase) {
  const categories = new Map(defaultCategories.map((category) => [category.id, category]))
  for (const category of await db.mealCategories.toArray()) categories.set(category.id, category)
  return [...categories.values()].sort((a, b) => a.order - b.order)
}

export async function addCategory(db: NutriTrackDatabase, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Zadajte názov kategórie.')
  return db.transaction('rw', db.mealCategories, async () => {
    const categories = await readCategories(db)
    if (categories.some((category) => searchTerm(category.name) === searchTerm(trimmed))) {
      throw new Error('Kategória s týmto názvom už existuje.')
    }
    const id = crypto.randomUUID()
    await db.mealCategories.add({ id, name: trimmed, order: Math.max(...categories.map(({ order }) => order)) + 1 })
    return id
  })
}

export function searchTerm(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('sk').trim()
}

export function matchesFood(food: Food, query: string) {
  const code = validGtin(query)
  if (code && equivalentGtin(food.barcode, code)) return true
  const haystack = searchTerm([food.name, food.brand, food.barcode].filter(Boolean).join(' '))
  return searchTerm(query).split(/\s+/).every((part) => haystack.includes(part))
}

export async function readCatalog(db: NutriTrackDatabase) {
  return db.transaction('r', [db.foods, db.servings, db.recipes, db.lastServings, db.mealCombinations], async () => {
    const [foods, servings, recipes, lastServings, combinations] = await Promise.all([
      db.foods.orderBy('name').toArray(), db.servings.toArray(),
      db.recipes.orderBy('name').toArray(), db.lastServings.toArray(), db.mealCombinations.orderBy('name').toArray(),
    ])
    return { foods, servings, recipes, lastServings, combinations }
  })
}

export async function findFoodByGtin(db: NutriTrackDatabase, input: string) {
  const code = validGtin(input)
  if (!code) return undefined
  const padded = code.padStart(14, '0')
  const candidates = [8, 12, 13, 14].map((length) => padded.slice(-length))
    .filter((candidate) => equivalentGtin(candidate, code))
  return db.foods.where('barcode').anyOf(candidates).first()
}

export async function toggleFavorite(db: NutriTrackDatabase, id: string) {
  await db.transaction('rw', db.foods, async () => {
    const food = await db.foods.get(id)
    if (!food) throw new Error('Potravina už nie je dostupná.')
    await db.foods.update(id, { favorite: !food.favorite })
  })
}

const foodWriteTables = (db: NutriTrackDatabase) => [
  db.foods, db.servings, db.recipes, db.lastServings, db.mealCombinations,
]

export async function importCatalogFood(db: NutriTrackDatabase, incoming: Food, updateId?: string) {
  return db.transaction('rw', foodWriteTables(db), async () => {
    const byId = await db.foods.get(updateId ?? incoming.id)
    const previous = byId ?? (incoming.barcode ? await findFoodByGtin(db, incoming.barcode) : undefined)
    if (!updateId) return previous?.id ?? await db.foods.add(incoming)

    if (!previous || previous.id !== updateId || previous.source.kind !== 'openFoodFacts'
      || incoming.source.kind !== 'openFoodFacts' || !incoming.barcode
      || !equivalentGtin(previous.source.externalId ?? previous.barcode, incoming.barcode)) {
      throw new Error('Záznam nie je dostupný alebo už má iný pôvod.')
    }
    const manual = previous.nutrition.nutrients.filter(({ source }) => source.kind === 'local')
    const { basis } = previous.nutrition
    if (manual.length && (basis.unit !== incoming.nutrition.basis.unit || basis.value !== incoming.nutrition.basis.value)) {
      throw new Error('Zdroj zmenil referenčné množstvo. Skontrolujte ručne zadané živiny v katalógu.')
    }
    const nutrients = new Map(incoming.nutrition.nutrients.map((nutrient) => [nutrient.id, nutrient]))
    for (const nutrient of manual) nutrients.set(nutrient.id, nutrient)
    const size = previous.package ?? incoming.package
    const updated: Food = {
      ...previous, source: incoming.source,
      nutrition: { basis: incoming.nutrition.basis, nutrients: [...nutrients.values()] },
      ...(size ? { package: size } : {}),
    }
    const servings = await db.servings.where('foodId').equals(previous.id).toArray()
    await saveFood(db, updated, servings, true)
    return previous.id
  })
}

function fullRecipeAmount(recipe: Recipe): PortionAmount {
  return recipe.yield.weightGrams !== undefined
    ? { unit: 'g', value: recipe.yield.weightGrams }
    : { unit: 'serving', value: recipe.yield.servings!, servingId: recipe.id }
}

export async function saveFood(db: NutriTrackDatabase, food: Food, servings: Serving[], editing: boolean) {
  await db.transaction('rw', foodWriteTables(db), async () => {
    const saved = editing ? await db.foods.get(food.id) : undefined
    if (editing && !saved) throw new Error('Potravina už nie je dostupná.')
    if (food.barcode && food.barcode !== saved?.barcode) {
      if (!validGtin(food.barcode)) throw new Error('Zadajte platný EAN alebo GTIN s kontrolnou číslicou.')
      const match = await findFoodByGtin(db, food.barcode)
      if (match && match.id !== food.id) throw new Error(`Tento čiarový kód už používa „${match.name}“.`)
    }
    const previous = await db.servings.where('foodId').equals(food.id).toArray()
    const previousIds = new Set(previous.map(({ id }) => id))
    for (const serving of servings) {
      resolveFoodAmount(food, { unit: serving.unit ?? 'serving', value: 1, servingId: serving.id }, servings)
    }
    const recipes = await db.recipes.filter((recipe) => recipe.ingredients.some(({ foodId }) => foodId === food.id)).toArray()
    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredients.filter(({ foodId }) => foodId === food.id)) {
        try {
          if (food.preparationState && food.preparationState !== ingredient.preparationState) throw new Error()
          resolveFoodAmount(food, ingredient.amount, servings)
        } catch {
          throw new Error(`Upravte najprv recept „${recipe.name}“, ktorý používa túto potravinu alebo porciu.`)
        }
      }
    }

    const combinations = await db.mealCombinations.toArray()
    for (const combination of combinations) {
      for (const entry of combination.items.filter(({ item }) => item.type === 'food' && item.id === food.id)) {
        try {
          resolveFoodAmount(food, entry.amount, servings)
        } catch {
          throw new Error(`Veľkosť sa používa v kombinácii „${combination.name}“. Najprv odstráňte kombináciu.`)
        }
      }
    }

    if (editing) await db.foods.put({ ...food, ...(saved?.favorite === undefined ? {} : { favorite: saved.favorite }) })
    else await db.foods.add(food)
    const currentIds = new Set(servings.map(({ id }) => id))
    await db.servings.bulkDelete(previous.filter(({ id }) => !currentIds.has(id)).map(({ id }) => id))
    for (const serving of servings) {
      if (previousIds.has(serving.id)) await db.servings.put(serving)
      else await db.servings.add(serving)
    }
    const last = await db.lastServings.get(food.id)
    if (last) {
      try {
        resolveFoodAmount(food, last.amount, servings)
      } catch {
        await db.lastServings.delete(food.id)
      }
    }
  })
}

export async function deleteFood(db: NutriTrackDatabase, id: string) {
  await db.transaction('rw', foodWriteTables(db), async () => {
    await checkCombinationRemoval(db, { type: 'food', id })
    const recipe = await db.recipes.filter(({ ingredients }) => ingredients.some(({ foodId }) => foodId === id)).first()
    if (recipe) throw new Error(`Potravina sa používa v recepte „${recipe.name}“. Najprv upravte recept.`)
    await db.foods.delete(id)
    await db.servings.where('foodId').equals(id).delete()
    await db.lastServings.delete(id)
  })
}

export async function saveRecipe(db: NutriTrackDatabase, recipe: Recipe, editing: boolean) {
  await db.transaction('rw', [db.recipes, db.foods, db.servings, db.mealCombinations], async () => {
    const [foods, servings] = await Promise.all([db.foods.toArray(), db.servings.toArray()])
    snapshotRecipe(recipe, fullRecipeAmount(recipe), foods, servings)
    if (editing) {
      if (!(await db.recipes.get(recipe.id))) throw new Error('Recept už nie je dostupný.')
      const combinations = await db.mealCombinations.toArray()
      for (const combination of combinations) {
        for (const entry of combination.items.filter(({ item }) => item.type === 'recipe' && item.id === recipe.id)) {
          try {
            snapshotRecipe(recipe, entry.amount, foods, servings)
          } catch {
            throw new Error(`Výťažnosť sa používa v kombinácii „${combination.name}“. Najprv odstráňte kombináciu.`)
          }
        }
      }
      await db.recipes.put(recipe)
    } else {
      await db.recipes.add(recipe)
    }
  })
}

async function checkCombinationRemoval(db: NutriTrackDatabase, target: MealEntry['item']) {
  const combination = await db.mealCombinations.filter(({ items }) =>
    items.some(({ item }) => item.type === target.type && item.id === target.id),
  ).first()
  if (combination) throw new Error(`Položka sa používa v kombinácii „${combination.name}“. Najprv odstráňte kombináciu.`)
}

export async function deleteRecipe(db: NutriTrackDatabase, id: string) {
  await db.transaction('rw', [db.recipes, db.mealCombinations], async () => {
    await checkCombinationRemoval(db, { type: 'recipe', id })
    await db.recipes.delete(id)
  })
}

type MealDetails = Pick<MealEntry, 'date' | 'time' | 'categoryId'> & MealLabels
type MealInput = MealDetails & Pick<MealEntry, 'item' | 'amount'>

async function validateMeal(db: NutriTrackDatabase, entry: MealDetails) {
  if (!isLocalDate(entry.date) || !isLocalTime(entry.time)) throw new Error('Skontrolujte dátum a čas jedla.')
  if (!(await readCategories(db)).some(({ id }) => id === entry.categoryId)) {
    throw new Error('Vyberte platnú kategóriu.')
  }
}

const mealTables = (db: NutriTrackDatabase) => [
  db.mealEntries, db.mealCategories, db.foods, db.servings, db.recipes, db.lastServings,
]

async function prepareSnapshot(db: NutriTrackDatabase, { item, amount }: MealCombination['items'][number]) {
  if (item.type === 'food') {
    const food = await db.foods.get(item.id)
    if (!food) throw new Error('Potravina už nie je dostupná.')
    const servings = await db.servings.where('foodId').equals(item.id).toArray()
    return snapshotFood(food, amount, servings)
  }
  const recipe = await db.recipes.get(item.id)
  if (!recipe) throw new Error('Recept už nie je dostupný.')
  const foodIds = [...new Set(recipe.ingredients.map(({ foodId }) => foodId))]
  const [foods, servings] = await Promise.all([
    db.foods.bulkGet(foodIds), db.servings.where('foodId').anyOf(foodIds).toArray(),
  ])
  return snapshotRecipe(recipe, amount, foods.filter((food) => food !== undefined), servings)
}

async function addMeal(db: NutriTrackDatabase, input: MealInput) {
  const id = crypto.randomUUID()
  const snapshot = await prepareSnapshot(db, input)
  await db.mealEntries.add({ ...input, id, snapshot })
  if (input.item.type === 'food') {
    await db.lastServings.put({
      foodId: input.item.id, amount: input.amount, usedAt: new Date().toISOString(), categoryId: input.categoryId,
    })
  }
  return id
}

export async function logMeal(db: NutriTrackDatabase, input: MealInput) {
  return db.transaction('rw', mealTables(db), async () => {
    await validateMeal(db, input)
    return addMeal(db, input)
  })
}

export async function saveCombination(db: NutriTrackDatabase, name: string, date: string, categoryId: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Zadajte názov kombinácie.')
  await db.transaction('rw', [...mealTables(db), db.mealCombinations], async () => {
    await validateMeal(db, { date, time: '00:00', categoryId })
    const entries = await db.mealEntries.where('[date+categoryId]').equals([date, categoryId]).sortBy('time')
    if (!entries.length) throw new Error('V kategórii nie sú zápisy na uloženie.')
    const items = entries.map(({ item, amount }) => ({ item, amount }))
    for (const entry of items) await prepareSnapshot(db, entry)
    await db.mealCombinations.add({ id: crypto.randomUUID(), name: trimmed, categoryId, items })
  })
}

export async function logCombination(db: NutriTrackDatabase, id: string, details: MealDetails) {
  await db.transaction('rw', [...mealTables(db), db.mealCombinations], async () => {
    await validateMeal(db, details)
    const combination = await db.mealCombinations.get(id)
    if (!combination) throw new Error('Kombinácia už nie je dostupná.')
    for (const entry of combination.items) await addMeal(db, { ...details, ...entry })
  })
}

export async function editMeal(db: NutriTrackDatabase, id: string, details: MealDetails, quantity?: number | Extract<PortionAmount, { unit: 'packageFraction' }>) {
  await db.transaction('rw', [db.mealEntries, db.mealCategories], async () => {
    await validateMeal(db, details)
    const original = await db.mealEntries.get(id)
    if (!original) throw new Error('Záznam už nie je dostupný.')
    if (quantity === undefined) {
      await db.mealEntries.update(id, details)
      return
    }
    const amount = original.amount.unit === 'packageFraction'
      ? (typeof quantity === 'number' ? undefined : quantity)
      : (typeof quantity === 'number' ? { ...original.amount, value: quantity } : undefined)
    if (!amount) throw new Error('Vyberte množstvo v pôvodnej jednotke záznamu.')
    await db.mealEntries.update(id, {
      ...details, amount, snapshot: resizeSnapshot(original.snapshot, original.amount, amount),
    })
  })
}

export async function copyMeal(db: NutriTrackDatabase, id: string, date: string) {
  if (!isLocalDate(date)) throw new Error('Vyberte dátum kopírovania.')
  await db.transaction('rw', db.mealEntries, async () => {
    const original = await db.mealEntries.get(id)
    if (!original) throw new Error('Záznam už nie je dostupný.')
    await db.mealEntries.add({ ...original, id: crypto.randomUUID(), date })
  })
}
