import { buildDays, eligibleEnergy, mean, measurementPoints, median, readAnalysisWindow } from './analysis'
import type { NutriTrackDatabase } from './database'
import { daysBetween, localDate, shiftDay } from './dates'
import { confirmGoal, estimateEnergy, estimateRestingEnergy, estimateTarget, goalForDay, type NewGoal } from './goals'
import type { BodyMeasurement, CalibrationEvidence, GoalHistory, Profile } from './model'
import { sumNutrients } from './nutrition'

export const calibrationDays = 56
const minimumIntakeDays = 42
const minimumWeighDays = 6
const maximumGoalStep = 150


type CalibrationGoal = NewGoal & { calibrationEvidence: CalibrationEvidence }

export function calculateCalibration(
  today: string, profile: Profile | undefined, activeGoal: GoalHistory | undefined,
  days: ReturnType<typeof buildDays>, measurements: readonly BodyMeasurement[],
) {
  const end = shiftDay(today, -1)
  const start = shiftDay(end, 1 - calibrationDays)
  const profileEstimate = profile && estimateEnergy(profile, today)
  const resting = profile && estimateRestingEnergy(profile, today)
  const stopped = (reason: string) => ({
    status: 'insufficient' as const, reason,
    baselineKcal: profileEstimate ? Math.round(profileEstimate) : null,
  })
  if (!profile || !profileEstimate || !resting || !profile.heightCm || !profile.weightKg) {
    return stopped('Doplňte profil dospelého vrátane hmotnosti a úrovne aktivity.')
  }
  const intake = eligibleEnergy(days.filter(({ date }) => date >= start && date <= end))
  const intakeWeeks = Array<number>(8).fill(0)
  for (const day of intake) intakeWeeks[Math.floor(daysBetween(start, day.date) / 7)]! += 1
  if (intake.length < minimumIntakeDays || intakeWeeks.some((count) => count < 4)) {
    return stopped(`Za posledných 56 ukončených dní je použiteľných ${intake.length}. Treba aspoň 42 a aspoň 4 v každom sedemdňovom úseku.`)
  }
  const observedIntake = mean(intake.map(({ kcal }) => kcal))!
  const estimatedEnergy = intake.flatMap(({ meals }) => meals).reduce((sum, { snapshot }) => {
    if (!snapshot.amount.estimated) return sum
    const energy = sumNutrients([snapshot]).find(({ id, unit }) => id === 'energy' && unit === 'kcal')
    return sum + (energy?.value ?? 0)
  }, 0)
  const estimatedShare = estimatedEnergy / (observedIntake * intake.length)
  if (observedIntake <= 0 || estimatedShare > 0.25) {
    return stopped('Príjem nie je dostatočne spoľahlivý. Skontrolujte energetické hodnoty a množstvá odhadnutých porcií.')
  }

  const weights = measurementPoints(measurements, 'weightKg').filter(({ date }) => date >= start && date <= end)
  const first = weights[0]
  const last = weights.at(-1)
  const samples = new Map<number, typeof weights>()
  for (const point of weights) {
    const week = Math.floor(daysBetween(start, point.date) / 7)
    const values = samples.get(week) ?? []
    values.push(point)
    samples.set(week, values)
  }
  if (weights.length < minimumWeighDays || samples.size < 5 || !first || !last
    || daysBetween(first.date, last.date) < 35 || daysBetween(start, first.date) > 13
    || daysBetween(last.date, end) > 13) {
    return stopped(`V okne je ${weights.length} dní s vážením. Treba aspoň 6 v najmenej 5 týždňoch, s rozpätím dátumov aspoň 35 dní a meraním pri oboch koncoch obdobia.`)
  }

  const weekly = [...samples.values()].map((points) => ({
    day: median(points.map(({ date }) => daysBetween(start, date))),
    kg: median(points.map(({ value }) => value)),
  }))
  const slopes = weekly.flatMap((a, index) => weekly.slice(index + 1).map((b) => (b.kg - a.kg) / (b.day - a.day)))
    .sort((a, b) => a - b)
  const slope = median(slopes)
  const middleWeight = median(weights.map(({ value }) => value))
  const spread = slopes[Math.floor(0.75 * (slopes.length - 1))]! - slopes[Math.floor(0.25 * (slopes.length - 1))]!
  if (Math.abs(slope * 7) > middleWeight * 0.01 || spread * 7 > Math.min(0.6, middleWeight * 0.008)) {
    return stopped('Týždenné merania kolíšu alebo sa hmotnosť mení príliš rýchlo na spoľahlivú kalibráciu. Krátkodobú zmenu môže ovplyvniť voda.')
  }

  // Heuristika energetickej bilancie pre kalibráciu, nie model budúcej hmotnosti.
  const rawEstimate = observedIntake - slope * 7700
  const difference = rawEstimate - profileEstimate
  if (!Number.isFinite(rawEstimate) || Math.abs(difference) > Math.min(650, profileEstimate * 0.30)) {
    return stopped('Odhad z denníka sa výrazne líši od profilu. Skontrolujte aktuálnosť profilu a pokrytie zápisov.')
  }
  const limit = Math.min(maximumGoalStep, profileEstimate * 0.08)
  const estimate = Math.round(profileEstimate + Math.max(-limit, Math.min(limit, difference / 2)))
  const uncertainty = Math.ceil(Math.max(150, observedIntake * 0.1, spread * 7700 / 2, Math.abs(rawEstimate - estimate)) / 25) * 25
  const evidence: CalibrationEvidence = {
    start, end, intakeDays: intake.length, weighDays: weights.length,
    observedIntakeKcal: Math.round(observedIntake), estimatedPortionEnergyShare: estimatedShare, weightChangeKgPerWeek: Math.round(slope * 7000) / 1000,
    baselineKcal: Math.round(profileEstimate), estimatedExpenditureKcal: estimate, uncertaintyKcal: uncertainty,
  }

  const direction = activeGoal?.direction ?? 'maintain'
  const weeklyChange = direction === 'maintain' ? 0 : activeGoal?.weeklyWeightChangeKg ?? 0.25
  const target = estimateTarget(estimate, direction, weeklyChange)
  const floor = Math.max(1200, Math.ceil(resting))
  const lowBmi = last.value / (profile.heightCm / 100) ** 2 < 18.5
  const safe = target >= floor && !(direction === 'lose' && lowBmi)
    && (!activeGoal || Math.abs(target - activeGoal.energyTargetKcal) <= maximumGoalStep)
  const changed = activeGoal?.energyTargetKcal !== target
  const proposal: CalibrationGoal | undefined = safe && changed ? {
    direction, weeklyWeightChangeKg: Math.abs(target - estimate) * 7 / 7700,
    energyTargetKcal: target, calculation: 'calibrated', calibrationEvidence: evidence,
  } : undefined

  return {
    status: 'ready' as const, evidence, proposal, currentTarget: activeGoal?.energyTargetKcal,
    reason: !safe ? 'Automatický návrh je mimo konzervatívnych limitov aplikácie pre tento profil alebo aktuálny cieľ.'
      : !changed ? 'Výsledný návrh sa zhoduje s aktuálnym cieľom.' : '',
  }
}

const tables = (db: NutriTrackDatabase) => [db.mealEntries, db.journalDays, db.bodyMeasurements, db.goals, db.profiles, db.mealCategories]

export async function readCalibration(db: NutriTrackDatabase, today = localDate()) {
  const end = shiftDay(today, -1)
  const start = shiftDay(end, 1 - calibrationDays)
  return db.transaction('r', tables(db), async () => {
    const window = await readAnalysisWindow(db, start, end)
    const active = window.profile?.activeGoalId ? await db.goals.get(window.profile.activeGoalId) : undefined
    return calculateCalibration(today, window.profile, active ? goalForDay([active], today) : undefined, buildDays(start, end, window.entries, window.status), window.measurements)
  })
}

export async function confirmCalibration(db: NutriTrackDatabase, expected: CalibrationGoal, day = localDate()) {
  await db.transaction('rw', tables(db), async () => {
    const latest = await readCalibration(db, day)
    if (latest.status !== 'ready' || !latest.proposal || JSON.stringify(latest.proposal) !== JSON.stringify(expected)) {
      throw new Error('Údaje sa od prípravy návrhu zmenili. Zobrazte aktuálny návrh.')
    }
    await confirmGoal(db, latest.proposal, day)
  })
}
