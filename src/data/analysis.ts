import Dexie from 'dexie'
import type { NutriTrackDatabase } from './database'
import { daysBetween, shiftDay, weekday } from './dates'
import { goalForDay } from './goals'
import { readCategories } from './journal'
import { contextLabels, patternLabels } from './mealLabels'
import type { BodyMeasurement, GoalHistory, JournalDay, MealEntry, NutrientUnit } from './model'
import { nutrientDefinitions, sumNutrients } from './nutrition'

export type AnalysisPeriod = 7 | 30 | 90

export async function readAnalysisWindow(db: NutriTrackDatabase, start: string, end: string) {
  return db.transaction('r', [db.mealEntries, db.journalDays, db.bodyMeasurements, db.goals, db.profiles, db.mealCategories], async () => {
    const [entries, status, measurements, goals, profile, categories] = await Promise.all([
      db.mealEntries.where('[date+time]').between([start, Dexie.minKey], [end, Dexie.maxKey], true, true).toArray(),
      db.journalDays.where('date').between(start, end, true, true).toArray(),
      db.bodyMeasurements.where('date').between(start, end, true, true).toArray(),
      db.goals.where('validFrom').belowOrEqual(end).toArray(),
      db.profiles.get('local'), readCategories(db),
    ])
    return { entries, status, measurements, goals, profile, categories }
  })
}

export function mean(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

export function buildDays(start: string, end: string, entries: readonly MealEntry[], status: readonly JournalDay[]) {
  const byDate = new Map<string, MealEntry[]>()
  for (const entry of entries) {
    const day = byDate.get(entry.date) ?? []
    day.push(entry)
    byDate.set(entry.date, day)
  }
  const marks = new Map(status.map(({ date, completeness }) => [date, completeness]))
  return Array.from({ length: daysBetween(start, end) + 1 }, (_, index) => {
    const date = shiftDay(start, index)
    const meals = byDate.get(date) ?? []
    const nutrients = sumNutrients(meals.map(({ snapshot }) => snapshot), true)
    const energy = nutrients.find(({ id, unit }) => id === 'energy' && unit === 'kcal')
    return {
      date, meals, nutrients, completeness: marks.get(date),
      recordedKcal: energy?.value ?? null,
      kcal: energy && !energy.partial ? energy.value : null,
      weekend: weekday(date) === 0 || weekday(date) === 6,
    }
  })
}

type Days = ReturnType<typeof buildDays>
type EnergyDay = Days[number] & { kcal: number }

export function eligibleEnergy(days: Days): EnergyDay[] {
  return days.filter((day): day is EnergyDay => day.completeness === 'complete' && day.kcal !== null)
}

export function nutrientDays(days: Days, id: string, unit: NutrientUnit) {
  const complete = days.filter((day) => day.completeness === 'complete')
  const found = complete.map((day) => day.nutrients.find((row) => row.id === id && row.unit === unit))
  const full = found.flatMap((row) => row && row.value !== null && !row.partial ? [row.value] : [])
  const available = found.flatMap((row) => row?.value == null ? [] : [row.value])
  return {
    id, unit, fullDays: full.length, knownDays: available.length, totalDays: complete.length,
    average: mean(full),
    recordedAverage: available.length ? available.reduce((sum, value) => sum + value, 0) / complete.length : null,
    coverage: available.length === 0 ? 'missing' as const
      : full.length === complete.length ? 'covered' as const : 'partial' as const,
  }
}

function energyRows(days: EnergyDay[]) {
  return days.flatMap(({ date, meals }) => meals.flatMap((entry) => {
    const energy = sumNutrients([entry.snapshot]).find(({ id, unit }) => id === 'energy' && unit === 'kcal')
    return energy?.value == null ? [] : [{ entry, date, kcal: energy.value }]
  }))
}

type EnergyRow = ReturnType<typeof energyRows>[number]

function groupEnergy(meals: EnergyRow[], group: (entry: MealEntry) => string, label: (entry: MealEntry) => string) {
  const groups = new Map<string, { key: string; name: string; kcal: number; count: number }>()
  for (const { entry, kcal } of meals) {
    const key = group(entry)
    const prior = groups.get(key)
    groups.set(key, { key, name: label(entry), kcal: (prior?.kcal ?? 0) + kcal, count: (prior?.count ?? 0) + 1 })
  }
  return [...groups.values()].sort((a, b) => b.kcal - a.kcal || a.name.localeCompare(b.name, 'sk'))
}

const timeSlots = [
  ['00:00', '06:00', '00:00 – 05:59'],
  ['06:00', '11:00', '06:00 – 10:59'],
  ['11:00', '16:00', '11:00 – 15:59'],
  ['16:00', '20:00', '16:00 – 19:59'],
  ['20:00', '24:00', '20:00 – 23:59'],
] as const

const habits = [
  { key: 'evening', label: 'Večerné občerstvenie od 20:00', matches: (entry: MealEntry) =>
    entry.time >= '20:00' && (entry.categoryId === 'snack' || Boolean(entry.patternTags?.length)) },
  ...Object.entries(patternLabels).map(([key, label]) => ({
    key, label, matches: (entry: MealEntry) => Boolean(entry.patternTags?.some((tag) => tag === key)),
  })),
  ...Object.entries(contextLabels).map(([key, label]) => ({
    key, label, matches: (entry: MealEntry) => Boolean(entry.context?.some((reason) => reason === key)),
  })),
]

export function analyzePeriod(days: Days, goals: readonly GoalHistory[], categoryNames: ReadonlyMap<string, string>) {
  const eligible = eligibleEnergy(days)
  const energy = energyRows(eligible)
  const compared = eligible.flatMap((day) => {
    const goal = goalForDay(goals, day.date)
    return goal ? [{ date: day.date, kcal: day.kcal, target: goal.energyTargetKcal, difference: day.kcal - goal.energyTargetKcal }] : []
  })
  const aboveGoalDates = new Set(compared.filter(({ difference }) => difference > 0).map(({ date }) => date))
  const sourceKey = ({ item }: MealEntry) => `${item.type}:${item.id}`
  const sourceName = ({ snapshot }: MealEntry) => snapshot.name
  const weeks = new Map<string, number[]>()
  for (const day of eligible) {
    const monday = shiftDay(day.date, -(weekday(day.date) + 6) % 7)
    const values = weeks.get(monday) ?? []
    values.push(day.kcal)
    weeks.set(monday, values)
  }
  const units = new Map(nutrientDefinitions.map(([id, , unit]) => [`${id}/${unit}`, { id, unit }]))
  for (const day of days.filter(({ completeness }) => completeness === 'complete')) {
    for (const { id, unit, value } of day.nutrients) if (value !== null) units.set(`${id}/${unit}`, { id, unit })
  }
  const summarize = (group: EnergyDay[]) => ({ days: group.length, average: mean(group.map(({ kcal }) => kcal)) })

  return {
    energy: summarize(eligible),
    goal: { days: compared.length, averageTarget: mean(compared.map(({ target }) => target)),
      averageDifference: mean(compared.map(({ difference }) => difference)), exceeded: aboveGoalDates.size },
    completeDays: days.filter(({ completeness }) => completeness === 'complete').length,
    incomplete: days.filter(({ meals, completeness }) => completeness !== 'complete' && (meals.length || completeness)),
    completeWithoutEnergy: days.filter(({ completeness, kcal }) => completeness === 'complete' && kcal === null),
    emptyDays: days.filter(({ meals, completeness }) => !meals.length && completeness === undefined).length,
    nutrients: [...units.values()].map(({ id, unit }) => nutrientDays(days, id, unit)),
    categories: groupEnergy(energy, ({ categoryId }) => categoryId, ({ categoryId }) => categoryNames.get(categoryId) ?? 'Bez kategórie'),
    sources: groupEnergy(energy, sourceKey, sourceName),
    sourcesAboveGoal: groupEnergy(energy.filter(({ date }) => aboveGoalDates.has(date)), sourceKey, sourceName),
    times: timeSlots.map(([start, end, label]) => {
      const within = energy.filter(({ entry }) => entry.time >= start && entry.time < end)
      return { label, entries: within.length, kcal: within.reduce((sum, row) => sum + row.kcal, 0) }
    }),
    weekday: summarize(eligible.filter((day) => !day.weekend)),
    weekend: summarize(eligible.filter((day) => day.weekend)),
    weeks: [...weeks.entries()].map(([date, values]) => ({ date, days: values.length, average: mean(values)! })),
    habits: habits.map(({ key, label, matches }) => {
      const tagged = energy.filter(({ entry }) => matches(entry))
      const dates = new Set(tagged.map(({ date }) => date))
      const withTag = eligible.filter((day) => dates.has(day.date))
      const other = eligible.filter((day) => !dates.has(day.date))
      return {
        key, label, entries: tagged.length, days: withTag.length, otherDays: other.length,
        kcal: tagged.reduce((sum, entry) => sum + entry.kcal, 0),
        withAverage: mean(withTag.map(({ kcal }) => kcal)), otherAverage: mean(other.map(({ kcal }) => kcal)),
      }
    }),
  }
}

export type PeriodAnalysis = ReturnType<typeof analyzePeriod>

export function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

export function measurementPoints(measurements: readonly BodyMeasurement[], field: 'weightKg' | 'waistCm') {
  const dates = new Map<string, number[]>()
  for (const row of measurements) {
    const value = row[field]
    if (value === undefined || !Number.isFinite(value) || value <= 0) continue
    const values = dates.get(row.date) ?? []
    values.push(value)
    dates.set(row.date, values)
  }
  return [...dates.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, value: median(values) }))
}
