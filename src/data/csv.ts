import type { NutriTrackDatabase } from './database'
import { readCategories } from './journal'
import type { MealEntry } from './model'
import { nutrientLabel, sumNutrients } from './nutrition'

type Cell = string | number | null | undefined

export function csv(rows: Cell[][]) {
  const cell = (value: Cell) => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'number') return String(value).replace('.', ',')
    const text = /^\s*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value
    return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  return '\uFEFF' + rows.map((row) => row.map(cell).join(';')).join('\r\n') + '\r\n'
}

function numericAmount(entry: MealEntry) {
  const amount = entry.amount
  return amount.unit === 'packageFraction' ? `${amount.numerator}/${amount.denominator}` : amount.value
}

const portionUnits = { g: 'g', ml: 'ml', piece: 'ks', serving: 'porcia', packageFraction: 'zlomok balenia' } as const

const macroIds = ['energy', 'protein', 'carbohydrates', 'fat']

export async function mealsCsv(db: NutriTrackDatabase) {
  return db.transaction('r', [db.mealEntries, db.mealCategories], async () => {
    const [meals, categories] = await Promise.all([db.mealEntries.orderBy('date').toArray(), readCategories(db)])
    return csv([
      ['Dátum', 'Čas', 'Kategória', 'Jedlo', 'Množstvo', 'Jednotka množstva', 'Prepočítané množstvo', 'Prepočítaná jednotka', 'Odhad', 'Energia (kcal)', 'Bielkoviny (g)', 'Sacharidy (g)', 'Tuky (g)'],
      ...meals.map((entry) => {
        const { date, time, categoryId, amount, snapshot } = entry
        const totals = sumNutrients([snapshot])
        return [
          date, time, categories.find(({ id }) => id === categoryId)?.name ?? categoryId, snapshot.name,
          numericAmount(entry), portionUnits[amount.unit], snapshot.amount.value, portionUnits[snapshot.amount.unit], snapshot.amount.estimated ? 'áno' : 'nie',
          ...macroIds.map((id) => totals.find((total) => total.id === id && total.unit === (id === 'energy' ? 'kcal' : 'g'))?.value),
        ]
      }),
    ])
  })
}

export async function daysCsv(db: NutriTrackDatabase) {
  return db.transaction('r', [db.mealEntries, db.journalDays], async () => {
    const [meals, days] = await Promise.all([db.mealEntries.orderBy('date').toArray(), db.journalDays.toArray()])
    const complete = new Set(days.filter(({ completeness }) => completeness === 'complete').map(({ date }) => date))
    const grouped = new Map<string, MealEntry[]>(days.map(({ date }) => [date, []]))
    for (const meal of meals) {
      const entries = grouped.get(meal.date) ?? []
      entries.push(meal)
      grouped.set(meal.date, entries)
    }
    return csv([
      ['Dátum', 'Kompletný deň', 'Živina', 'Zaznamenané množstvo', 'Jednotka', 'Zápisy s údajom', 'Počet zápisov', 'Neúplný údaj'],
      ...[...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([date, entries]) =>
        sumNutrients(entries.map(({ snapshot }) => snapshot), true).map(({ id, value, unit, known, total, partial }) =>
          [date, complete.has(date) ? 'áno' : 'nie', nutrientLabel(id), value, unit, known, total, value === null || partial ? 'áno' : 'nie'],
        ),
      ),
    ])
  })
}

export async function measurementsCsv(db: NutriTrackDatabase) {
  const measurements = await db.bodyMeasurements.orderBy('date').toArray()
  return csv([
    ['Dátum', 'Hmotnosť (kg)', 'Obvod pásu (cm)', 'Poznámka'],
    ...measurements.map(({ date, weightKg, waistCm, note }) => [date, weightKg, waistCm, note]),
  ])
}
