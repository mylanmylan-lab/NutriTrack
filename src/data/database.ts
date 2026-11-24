import Dexie, { type EntityTable } from 'dexie'
import type {
  ActivityEntry,
  BodyMeasurement,
  Food,
  GoalHistory,
  JournalDay,
  LastServing,
  MealCategory,
  MealCombination,
  MealEntry,
  Preferences,
  Profile,
  Recipe,
  Serving,
} from './model'

export const DATABASE_NAME = 'nutritrack'
export const SCHEMA_VERSION = 4

export class NutriTrackDatabase extends Dexie {
  profiles!: EntityTable<Profile, 'id'>
  preferences!: EntityTable<Preferences, 'id'>
  foods!: EntityTable<Food, 'id'>
  servings!: EntityTable<Serving, 'id'>
  recipes!: EntityTable<Recipe, 'id'>
  mealCategories!: EntityTable<MealCategory, 'id'>
  mealEntries!: EntityTable<MealEntry, 'id'>
  bodyMeasurements!: EntityTable<BodyMeasurement, 'id'>
  activities!: EntityTable<ActivityEntry, 'id'>
  goals!: EntityTable<GoalHistory, 'id'>
  journalDays!: EntityTable<JournalDay, 'date'>
  lastServings!: EntityTable<LastServing, 'foodId'>
  mealCombinations!: EntityTable<MealCombination, 'id'>

  constructor(name = DATABASE_NAME) {
    super(name)

    this.version(1).stores({
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

    this.version(2).stores({
      mealEntries: 'id, date, categoryId, [date+categoryId]',
      journalDays: 'date',
      lastServings: 'foodId',
    })
    this.version(3).stores({
      mealCombinations: 'id, name',
    })
    this.version(4).stores({
      mealEntries: 'id, date, categoryId, [date+categoryId], [date+time]',
    })
  }
}

export const database = new NutriTrackDatabase()
