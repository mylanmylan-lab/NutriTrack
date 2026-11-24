/** Miestny kalendárny dátum a čas zapisujeme vo formátoch YYYY-MM-DD a HH:mm. */
export type LocalDate = string
export type LocalTime = string
/** Časová pečiatka ISO 8601 v UTC. */
export type Timestamp = string

export type ThemePreference = 'system' | 'light' | 'dark'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'veryHigh'
export type FormulaSex = 'female' | 'male'
export type GoalDirection = 'lose' | 'maintain' | 'gain'

export interface Profile {
  id: 'local'
  age?: { birthDate: LocalDate } | { years: number; asOf: LocalDate }
  formulaSex?: FormulaSex
  heightCm?: number
  weightKg?: number
  activityLevel?: ActivityLevel
  activeGoalId?: string
}

export interface Preferences {
  id: 'local'
  theme: ThemePreference
}

export interface FoodSource {
  kind: 'local' | 'openFoodFacts' | 'usda'
  externalId?: string
  version?: string
  retrievedAt?: Timestamp
}

export type NutrientUnit = 'kcal' | 'kJ' | 'g' | 'mg' | 'µg' | 'IU'
export type NutritionAmountUnit = 'g' | 'ml'

export interface Nutrient {
  /** Stabilný identifikátor, napríklad energy alebo vitaminC. */
  id: string
  unit: NutrientUnit
  value: number | null
  source: FoodSource
  coverage?: { known: number; total: number }
  referenceIntake?: { value: number; unit: NutrientUnit; source: string }
}

export interface Nutrition {
  basis: { value: number; unit: NutritionAmountUnit }
  /** Chýbajúci identifikátor aj hodnota null znamenajú nedostupný údaj. */
  nutrients: Nutrient[]
}

export type PreparationState = 'raw' | 'cooked'

export interface Food {
  id: string
  name: string
  brand?: string
  favorite?: boolean
  /** GTIN môže začínať nulou. */
  barcode?: string
  source: FoodSource
  preparationState?: PreparationState
  nutrition: Nutrition
  package?: { value: number; unit: NutritionAmountUnit }
  density?: { gramsPerMillilitre: number; estimated: boolean }
}

export type PortionAmount =
  | { unit: NutritionAmountUnit; value: number }
  | { unit: 'piece' | 'serving'; value: number; servingId: string }
  | { unit: 'packageFraction'; numerator: number; denominator: number }

export interface Serving {
  id: string
  foodId: string
  label: string
  estimated?: boolean
  unit?: 'piece' | 'serving'
  conversion:
    | { kind: 'mass'; grams: number }
    | { kind: 'volume'; millilitres: number }
    | { kind: 'packageFraction'; numerator: number; denominator: number }
}

export interface LastServing {
  foodId: string
  amount: PortionAmount
  usedAt: Timestamp
  categoryId?: string
}

export interface ResolvedAmount {
  value: number
  unit: NutritionAmountUnit
  estimated: boolean
}

export interface RecipeIngredient {
  foodId: string
  amount: PortionAmount
  preparationState: PreparationState
}

export interface Recipe {
  id: string
  name: string
  ingredients: RecipeIngredient[]
  yield: { weightGrams: number; servings?: number } | { weightGrams?: number; servings: number }
}

export interface MealCategory {
  id: string
  name: string
  order: number
}

export type MealPattern = 'sweets' | 'savorySnacks' | 'caloricDrinks'

export type SnackContext = 'hunger' | 'enjoyment' | 'rest' | 'stressOrFatigue'

export interface MealNutritionSnapshot {
  name: string
  amount: ResolvedAmount | { value: number; unit: 'serving'; estimated: boolean }
  /** Nutričné hodnoty už prepočítané na zaznamenané množstvo. */
  nutrients: Nutrient[]
  sources: FoodSource[]
}

export interface MealEntry {
  id: string
  date: LocalDate
  time: LocalTime
  categoryId: string
  item: { type: 'food' | 'recipe'; id: string }
  amount: PortionAmount
  context?: SnackContext[]
  patternTags?: MealPattern[]
  snapshot: MealNutritionSnapshot
}

export interface MealCombination {
  id: string
  name: string
  categoryId: string
  items: Pick<MealEntry, 'item' | 'amount'>[]
}

export interface JournalDay {
  date: LocalDate
  completeness: 'complete' | 'incomplete'
}

export interface BodyMeasurement {
  id: string
  date: LocalDate
  weightKg?: number
  waistCm?: number
  note?: string
}

export interface ActivityEntry {
  id: string
  date: LocalDate
  type: string
  durationMinutes: number
  estimatedEnergyKcal?: number
  accounting: 'includedInActivityLevel' | 'separateEstimate'
}

export interface CalibrationEvidence {
  start: LocalDate
  end: LocalDate
  intakeDays: number
  weighDays: number
  observedIntakeKcal: number
  estimatedPortionEnergyShare: number
  weightChangeKgPerWeek: number
  baselineKcal: number
  estimatedExpenditureKcal: number
  uncertaintyKcal: number
}

export interface GoalHistory {
  id: string
  validFrom: LocalDate
  /** Prvý deň, na ktorý sa tento cieľ už nevzťahuje. */
  validUntil?: LocalDate
  direction: GoalDirection
  weeklyWeightChangeKg?: number
  energyTargetKcal: number
  calculation: 'mifflinStJeor' | 'manual' | 'calibrated'
  confirmedAt: Timestamp
  calibrationEvidence?: CalibrationEvidence
}

export interface BackupMetadata {
  format: 'nutritrack'
  formatVersion: number
  schemaVersion: number
  exportedAt: Timestamp
  integrity: { algorithm: 'SHA-256'; digest: string }
}
