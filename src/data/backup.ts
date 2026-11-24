import { z } from 'zod'
import { SCHEMA_VERSION, type NutriTrackDatabase } from './database'
import { isLocalDate, isLocalTime } from './dates'

const date = z.string().refine(isLocalDate)
const time = z.string().refine(isLocalTime)
const timestamp = z.iso.datetime()
const id = z.string().min(1).refine((value) => value.trim().length > 0)
const positive = z.number().positive()
const count = z.int().nonnegative()
const nonnegative = z.number().nonnegative()
const basisUnit = z.enum(['g', 'ml'])
const nutrientUnit = z.enum(['kcal', 'kJ', 'g', 'mg', 'µg', 'IU'])
const preparation = z.enum(['raw', 'cooked'])
const source = z.strictObject({
  kind: z.enum(['local', 'openFoodFacts', 'usda']),
  externalId: z.string().optional(), version: z.string().optional(), retrievedAt: timestamp.optional(),
})
const nutrient = z.strictObject({
  id, unit: nutrientUnit, value: nonnegative.nullable(), source,
  coverage: z.strictObject({ known: count, total: z.int().positive() })
    .refine(({ known, total }) => known <= total).optional(),
  referenceIntake: z.strictObject({ value: nonnegative, unit: nutrientUnit, source: z.string() }).optional(),
})
const basis = z.strictObject({ value: positive, unit: basisUnit })
const importAmount = z.union([
  basis,
  z.strictObject({ value: positive, unit: z.enum(['piece', 'serving']), servingId: id }),
  z.strictObject({ unit: z.literal('packageFraction'), numerator: positive, denominator: positive }),
])
const conversion = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('mass'), grams: positive }),
  z.strictObject({ kind: z.literal('volume'), millilitres: positive }),
  z.strictObject({ kind: z.literal('packageFraction'), numerator: positive, denominator: positive }),
])

function rows<T extends z.ZodType>(record: T, key: string) {
  return z.array(record).refine((items) => {
    const keys = items.map((item) => Reflect.get(item as object, key))
    return new Set(keys).size === keys.length
  })
}

const dataSchema = z.strictObject({
  profiles: rows(z.strictObject({
    id: z.literal('local'),
    age: z.union([z.strictObject({ birthDate: date }), z.strictObject({ years: count, asOf: date })]).optional(),
    formulaSex: z.enum(['male', 'female']).optional(),
    heightCm: positive.optional(), weightKg: positive.optional(),
    activityLevel: z.enum(['sedentary', 'light', 'moderate', 'high', 'veryHigh']).optional(),
    activeGoalId: id.optional(),
  }), 'id'),
  preferences: rows(z.strictObject({
    id: z.literal('local'), theme: z.enum(['system', 'light', 'dark']),
  }), 'id'),
  foods: rows(z.strictObject({
    id, name: id, brand: z.string().optional(), barcode: z.string().optional(), source, favorite: z.boolean().optional(),
    preparationState: preparation.optional(), package: basis.optional(),
    nutrition: z.strictObject({ basis, nutrients: z.array(nutrient) }),
    density: z.strictObject({ gramsPerMillilitre: positive, estimated: z.boolean() }).optional(),
  }), 'id'),
  servings: rows(z.strictObject({
    id, foodId: id, label: id, estimated: z.boolean().optional(),
    unit: z.enum(['piece', 'serving']).optional(), conversion,
  }), 'id'),
  recipes: rows(z.strictObject({
    id, name: id,
    ingredients: z.array(z.strictObject({ foodId: id, amount: importAmount, preparationState: preparation })).min(1),
    yield: z.strictObject({ weightGrams: positive.optional(), servings: positive.optional() })
      .refine(({ weightGrams, servings }) => weightGrams !== undefined || servings !== undefined),
  }), 'id'),
  mealCategories: rows(z.strictObject({ id, name: id, order: count }), 'id'),
  mealEntries: rows(z.strictObject({
    id, date, time, categoryId: id, amount: importAmount,
    item: z.strictObject({ id, type: z.enum(['food', 'recipe']) }),
    patternTags: z.array(z.enum(['sweets', 'savorySnacks', 'caloricDrinks'])).optional(),
    context: z.array(z.enum(['hunger', 'enjoyment', 'rest', 'stressOrFatigue'])).optional(),
    snapshot: z.strictObject({
      name: id, amount: z.strictObject({ unit: z.enum(['g', 'ml', 'serving']), value: positive, estimated: z.boolean() }),
      nutrients: z.array(nutrient), sources: z.array(source),
    }),
  }), 'id'),
  bodyMeasurements: rows(z.strictObject({
    id, date, weightKg: positive.optional(), waistCm: positive.optional(), note: z.string().optional(),
  }).refine(({ weightKg, waistCm }) => weightKg !== undefined || waistCm !== undefined), 'id'),
  activities: rows(z.strictObject({
    id, date, type: id, durationMinutes: positive, estimatedEnergyKcal: nonnegative.optional(),
    accounting: z.enum(['includedInActivityLevel', 'separateEstimate']),
  }), 'id'),
  goals: rows(z.strictObject({
    id, validFrom: date, validUntil: date.optional(), direction: z.enum(['lose', 'maintain', 'gain']),
    weeklyWeightChangeKg: nonnegative.optional(), energyTargetKcal: positive,
    calculation: z.enum(['mifflinStJeor', 'manual', 'calibrated']), confirmedAt: timestamp,
    calibrationEvidence: z.strictObject({
      start: date, end: date, intakeDays: z.int().positive(), weighDays: z.int().positive(),
      observedIntakeKcal: positive, estimatedPortionEnergyShare: z.number().min(0).max(1), weightChangeKgPerWeek: z.number(), baselineKcal: positive,
      estimatedExpenditureKcal: positive, uncertaintyKcal: positive,
    }).refine(({ start, end }) => start <= end).optional(),
  }).refine(({ validFrom, validUntil }) => !validUntil || validUntil >= validFrom), 'id'),
  journalDays: rows(z.strictObject({ date, completeness: z.enum(['complete', 'incomplete']) }), 'date'),
  mealCombinations: rows(z.strictObject({
    id, name: id, categoryId: id,
    items: z.array(z.strictObject({
      item: z.strictObject({ id, type: z.enum(['food', 'recipe']) }),
      amount: importAmount,
    })).min(1),
  }), 'id'),
  lastServings: rows(z.strictObject({ foodId: id, amount: importAmount, usedAt: timestamp, categoryId: id.optional() }), 'foodId'),
})

type BackupData = z.infer<typeof dataSchema>
type StoreName = keyof BackupData
const stores = Object.keys(dataSchema.shape) as StoreName[]

const integrity = z.strictObject({ algorithm: z.literal('SHA-256'), digest: z.string().regex(/^[0-9a-f]{64}$/) })
const envelope = z.strictObject({
  format: z.literal('nutritrack'), exportedAt: timestamp, integrity,
})
const backupSchema = z.discriminatedUnion('formatVersion', [
  envelope.extend({ formatVersion: z.literal(1), schemaVersion: z.literal(2), data: dataSchema.omit({ mealCombinations: true }) }),
  envelope.extend({ formatVersion: z.literal(2), schemaVersion: z.literal(3), data: dataSchema }),
  envelope.extend({ formatVersion: z.literal(3), schemaVersion: z.literal(SCHEMA_VERSION), data: dataSchema }),
])

function validateReferences(data: BackupData) {
  const foods = new Set(data.foods.map(({ id }) => id))
  const servings = new Map(data.servings.map((serving) => [serving.id, serving]))
  const goals = new Set(data.goals.map(({ id }) => id))
  const recipes = new Map(data.recipes.map((recipe) => [recipe.id, recipe]))
  const isValidAmount = (foodId: string, amount: z.infer<typeof importAmount>) => {
    if (!foods.has(foodId)) return false
    if (!('servingId' in amount)) return true
    const serving = servings.get(amount.servingId)
    return serving?.foodId === foodId && (!serving.unit || serving.unit === amount.unit)
  }

  if (data.servings.some(({ foodId }) => !foods.has(foodId))
    || data.lastServings.some(({ foodId, amount }) => !isValidAmount(foodId, amount))
    || data.recipes.some(({ ingredients }) => ingredients.some(({ foodId, amount }) => !isValidAmount(foodId, amount)))
    || data.mealCombinations.some(({ items }) => items.some(({ item, amount }) => {
      if (item.type === 'food') return !isValidAmount(item.id, amount)
      const recipe = recipes.get(item.id)
      return !recipe || !((amount.unit === 'g' && recipe.yield.weightGrams !== undefined)
        || (amount.unit === 'serving' && amount.servingId === item.id && recipe.yield.servings !== undefined))
    }))
    || data.profiles.some(({ activeGoalId }) => activeGoalId && !goals.has(activeGoalId))) {
    throw new Error('V zálohe chýba údaj, na ktorý odkazuje iný záznam.')
  }
}

async function sha256(data: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(data))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function exportBackup(db: NutriTrackDatabase) {
  const data = await db.transaction('r', db.tables, async () =>
    Object.fromEntries(await Promise.all(stores.map(async (store) => [store, await db.table(store).toArray()]))),
  )
  const unsigned = { format: 'nutritrack', formatVersion: 3, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data }
  const integrity = { algorithm: 'SHA-256', digest: await sha256(unsigned) }
  return JSON.stringify({ ...unsigned, integrity }, null, 2)
}

async function parseBackup(text: string) {
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    throw new Error('Súbor neobsahuje platný JSON.')
  }

  const result = backupSchema.safeParse(raw)
  if (!result.success) {
    const location = result.error.issues[0]?.path.join('.')
    throw new Error(`Súbor nezodpovedá formátu zálohy NutriTrack${location ? ` (${location})` : ''}.`)
  }
  const { integrity, ...unsigned } = raw as typeof result.data
  if (await sha256(unsigned) !== integrity.digest) throw new Error('Kontrolný súčet zálohy nesúhlasí.')
  const data = result.data.formatVersion === 1 ? { ...result.data.data, mealCombinations: [] } : result.data.data
  validateReferences(data)
  return { data, exportedAt: result.data.exportedAt }
}

export async function inspectBackup(text: string) {
  const { exportedAt, data } = await parseBackup(text)
  return { exportedAt, counts: Object.fromEntries(stores.map((store) => [store, data[store].length])) as Record<StoreName, number> }
}

export async function restoreBackup(db: NutriTrackDatabase, text: string) {
  const { data } = await parseBackup(text)
  await db.transaction('rw', db.tables, async () => {
    for (const store of stores) {
      const table = db.table(store)
      await table.clear()
      await table.bulkAdd(data[store])
    }
  })
}
