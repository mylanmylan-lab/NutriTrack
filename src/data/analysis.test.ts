import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { analyzePeriod, buildDays, measurementPoints, readAnalysisWindow } from './analysis'
import { confirmCalibration, calculateCalibration, readCalibration } from './calibration'
import { exportBackup, restoreBackup } from './backup'
import { NutriTrackDatabase } from './database'
import { shiftDay } from './dates'
import { confirmGoal, estimateTarget } from './goals'
import type { BodyMeasurement, GoalHistory, JournalDay, MealEntry, Nutrient, Profile } from './model'
import { localSource } from './nutrition'
import { observations } from './recommendations'
import { adultReferences } from './references'

const databases: NutriTrackDatabase[] = []
const today = '2026-11-23'
const profile: Profile = { id: 'local', age: { birthDate: '1996-01-01' }, formulaSex: 'male', heightCm: 175, weightKg: 70, activityLevel: 'sedentary' }
const complete = (date: string): JournalDay => ({ date, completeness: 'complete' })
const value = (id: string, value: number | null, unit: Nutrient['unit']): Nutrient => ({ id, value, unit, source: localSource })

function meal(date: string, energy: number | null, details: Partial<MealEntry> = {}, micros: Nutrient[] = []): MealEntry {
  return {
    id: `meal-${date}`, date, time: '12:00', categoryId: 'lunch', item: { type: 'food', id: 'food' },
    amount: { value: 100, unit: 'g' },
    snapshot: { name: 'Záznam v teste', amount: { value: 100, unit: 'g', estimated: false },
      sources: [localSource], nutrients: [value('energy', energy, 'kcal'), value('fiber', 12, 'g'), ...micros] },
    ...details,
  }
}

function goal(id: string, validFrom: string, target: number, validUntil?: string): GoalHistory {
  return { id, validFrom, direction: 'maintain', energyTargetKcal: target, confirmedAt: `${validFrom}T12:00:00Z`,
    calculation: 'manual', ...(validUntil ? { validUntil } : {}) }
}

function database() {
  const db = new NutriTrackDatabase(crypto.randomUUID())
  databases.push(db)
  return db
}

afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete()
})

describe('analýza obdobia', () => {
  it('oddelí neúplnosť dňa od dostupnosti energie a porovná historické ciele a víkendy', () => {
    const start = '2026-11-16'
    const meals = [
      meal(start, 2000, {}, [value('vitaminC', 0, 'mg')]),
      meal('2026-11-17', null),
      meal('2026-11-21', 2600, { time: '21:00', categoryId: 'snack', patternTags: ['sweets'], context: ['enjoyment', 'rest'] }),
      meal('2026-11-22', 10_000),
    ]
    const dates = [start, '2026-11-17', '2026-11-20', '2026-11-21'].map(complete)
    const data = analyzePeriod(buildDays(start, '2026-11-22', meals, dates),
      [goal('old', '2026-01-01', 2200, '2026-11-21'), goal('new', '2026-11-21', 2100)], new Map([['snack', 'Občerstvenie']]))
    expect(data.energy).toEqual({ days: 2, average: 2300 })
    expect(data.goal).toEqual({ days: 2, averageTarget: 2150, averageDifference: 150, exceeded: 1 })
    expect(data.weekday).toEqual({ days: 1, average: 2000 })
    expect(data.weekend).toEqual({ days: 1, average: 2600 })
    expect(data.weeks).toEqual([{ date: start, days: 2, average: 2300 }])
    expect(data.incomplete.map(({ date }) => date)).toEqual(['2026-11-22'])
    expect(data.completeWithoutEnergy.map(({ date }) => date)).toEqual(['2026-11-17', '2026-11-20'])
    expect(data.categories[0]).toMatchObject({ name: 'Občerstvenie', kcal: 2600 })
    expect(data.sources[0]).toMatchObject({ kcal: 4600 })
    expect(data.sourcesAboveGoal[0]).toMatchObject({ kcal: 2600 })
    expect(data.times.at(-1)).toMatchObject({ entries: 1, kcal: 2600 })
    expect(data.habits.find(({ key }) => key === 'evening')).toMatchObject({ entries: 1, days: 1, kcal: 2600 })
    expect(data.habits.find(({ key }) => key === 'rest')).toMatchObject({ entries: 1 })
    expect(observations(data, true)).toEqual([])
  })

  it('rozlíši známu nulu, chýbajúci údaj, alternatívne jednotky a čiastkovú živinu v recepte', () => {
    const dates = ['2026-11-16', '2026-11-17']
    const meals = dates.map((date, index) => meal(date, 1900, {}, [
      value('vitaminD', 0, 'µg'), value('vitaminA', 40, 'IU'),
      { ...value('vitaminC', index === 0 ? 8 : null, 'mg'), coverage: { known: 1, total: 2 } },
    ]))
    const { nutrients } = analyzePeriod(buildDays(dates[0]!, dates[1]!, meals, dates.map(complete)), [], new Map())
    expect(nutrients.find(({ id }) => id === 'vitaminD')).toMatchObject({ average: 0, coverage: 'covered', fullDays: 2 })
    expect(nutrients.find(({ id }) => id === 'magnesium')).toMatchObject({ recordedAverage: null, coverage: 'missing' })
    expect(nutrients.find(({ id }) => id === 'vitaminC')).toMatchObject({ recordedAverage: 4, average: null, coverage: 'partial', knownDays: 1 })
    expect(nutrients.find(({ id, unit }) => id === 'vitaminA' && unit === 'IU')).toMatchObject({ average: 40, coverage: 'covered' })
  })

  it('použije vekovú a pohlavnú referenciu a zobrazí rozpätie pri neznámej menopauze', () => {
    const adult = adultReferences(profile, today)
    expect(adult.vitaminC).toMatchObject({ value: 110, unit: 'mg' })
    expect(adult.calcium).toMatchObject({ value: 950 })
    const young = adultReferences({ ...profile, age: { years: 20, asOf: today }, formulaSex: 'female' }, today)
    expect(young.vitaminC).toMatchObject({ value: 95 })
    expect(young.calcium).toMatchObject({ value: 1000 })
    expect(young.iron).toMatchObject({ value: 11, upper: 16 })
    expect(adultReferences({ ...profile, age: { years: 17, asOf: today } }, today)).toEqual({})
  })

  it('zachová hranice priestupného dňa aj reprezentáciu opakovaných vážení', () => {
    expect(buildDays('2024-02-28', '2024-03-01', [], []).map(({ date }) => date))
      .toEqual(['2024-02-28', '2024-02-29', '2024-03-01'])
    expect(measurementPoints([
      { id: 'one', date: today, weightKg: 71 }, { id: 'two', date: today, weightKg: 69 }, { id: 'waist', date: today, waistCm: 80 },
    ], 'weightKg')).toEqual([{ date: today, value: 70 }])
  })

  it('radí zvýšiť vlákninu iba pri dostatočnom pokrytí a zachová zdôvodnenie opakovaného prekročenia', () => {
    const start = '2026-11-16'
    const dates = Array.from({ length: 7 }, (_, index) => shiftDay(start, index))
    const meals = dates.map((date) => meal(date, 2300))
    const row = goal('g', start, 2100)
    const data = analyzePeriod(buildDays(start, dates.at(-1)!, meals, dates.map(complete)), [row], new Map())
    expect(observations(data, true)).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Opakované prekročenie cieľa', evidence: expect.stringContaining('7 z 7') }),
      expect.objectContaining({ title: 'Vláknina pod referenčným príjmom' }),
    ]))
    const first = meals[0]!
    first.snapshot.nutrients = [value('energy', 2300, 'kcal')]
    const partial = analyzePeriod(buildDays(start, dates.at(-1)!, meals, dates.map(complete)), [row], new Map())
    expect(observations(partial, true).some(({ title }) => title.includes('Vláknina'))).toBe(false)
  })
})

const calibrationStart = shiftDay(today, -56)
const calibrationEnd = shiftDay(today, -1)
const intakeDates = Array.from({ length: 56 }, (_, index) => shiftDay(calibrationStart, index))
const intake = intakeDates.map((date) => meal(date, 2150))
const weights = Array.from({ length: 8 }, (_, index): BodyMeasurement => ({
  id: `weight-${index}`, date: shiftDay(calibrationStart, index * 7), weightKg: 70 - index * 0.1,
}))

describe('kalibrácia výdaja', () => {
  it('odmietne nedostatočný príjem, jedno váženie aj nestabilný trend', () => {
    const days = buildDays(calibrationStart, calibrationEnd, intake, intakeDates.map(complete))
    expect(calculateCalibration(today, profile, undefined, days, weights.slice(0, 1))).toMatchObject({ status: 'insufficient', reason: expect.stringContaining('vážením') })
    const uneven = buildDays(calibrationStart, calibrationEnd, intake, intakeDates.slice(0, 43).map(complete))
    expect(calculateCalibration(today, profile, undefined, uneven, weights)).toMatchObject({ status: 'insufficient', reason: expect.stringContaining('sedemdňovom úseku') })
    const estimated = intake.map((row) => ({ ...row, snapshot: { ...row.snapshot, amount: { ...row.snapshot.amount, estimated: true } } }))
    const uncertain = buildDays(calibrationStart, calibrationEnd, estimated, intakeDates.map(complete))
    expect(calculateCalibration(today, profile, undefined, uncertain, weights)).toMatchObject({ status: 'insufficient', reason: expect.stringContaining('odhadnutých porcií') })
    const noisy = weights.map((row, index) => ({ ...row, weightKg: index % 2 ? 65 : 75 }))
    expect(calculateCalibration(today, profile, undefined, days, noisy)).toMatchObject({ status: 'insufficient', reason: expect.stringContaining('kolíšu') })
  })

  it('vypočíta trend a drží odporúčanú zmenu a deficit v konzervatívnych hraniciach', () => {
    const days = buildDays(calibrationStart, calibrationEnd, intake, intakeDates.map(complete))
    const result = calculateCalibration(today, profile, goal('active', calibrationStart, 2050), days, weights)
    expect(result).toMatchObject({ status: 'ready', evidence: {
      start: calibrationStart, end: calibrationEnd, observedIntakeKcal: 2150, intakeDays: 56,
      weighDays: 8, weightChangeKgPerWeek: -0.1,
    } })
    if (result.status !== 'ready') throw new Error(result.reason)
    expect(result.evidence.estimatedExpenditureKcal - result.evidence.baselineKcal).toBeLessThanOrEqual(150)
    expect(Math.abs(result.proposal!.energyTargetKcal - 2050)).toBeLessThanOrEqual(150)
    const rejected = calculateCalibration(today, profile, goal('active', calibrationStart, 1100), days, weights)
    expect(rejected).toMatchObject({ status: 'ready', proposal: undefined })
    expect(estimateTarget(2000, 'lose', 2)).toBe(1700)
    expect(estimateTarget(1600, 'lose', 2)).toBe(1360)
  })

  it('uloží iba potvrdený aktuálny návrh, zachová snímky a obnoví dôkazy zo zálohy', async () => {
    const db = database()
    await db.profiles.add(profile)
    await confirmGoal(db, { direction: 'maintain', energyTargetKcal: 2050, calculation: 'manual' }, calibrationStart)
    await db.mealEntries.bulkAdd(intake)
    await db.bodyMeasurements.bulkAdd(weights)
    await db.journalDays.bulkAdd(intakeDates.map(complete))
    const window = await readAnalysisWindow(db, calibrationStart, calibrationEnd)
    expect(window.entries).toHaveLength(56)
    const preview = await readCalibration(db, today)
    expect(await db.goals.count()).toBe(1)
    if (preview.status !== 'ready' || !preview.proposal) throw new Error('Chýba návrh.')

    await db.journalDays.update(calibrationEnd, { completeness: 'incomplete' })
    await expect(confirmCalibration(db, preview.proposal, today)).rejects.toThrow('zmenili')
    expect(await db.goals.count()).toBe(1)
    await db.journalDays.update(calibrationEnd, { completeness: 'complete' })
    await confirmCalibration(db, preview.proposal, today)
    expect(await db.goals.count()).toBe(2)
    expect(await db.mealEntries.get(intake[0]!.id)).toEqual(intake[0])

    const restored = database()
    await restoreBackup(restored, await exportBackup(db))
    const active = (await restored.profiles.get('local'))?.activeGoalId
    expect(await restored.goals.get(active!)).toMatchObject({ calculation: 'calibrated', calibrationEvidence: preview.evidence })
    expect(await restored.mealEntries.get(intake[0]!.id)).toEqual(intake[0])
  })
})
