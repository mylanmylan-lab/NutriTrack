import type { NutriTrackDatabase } from './database'
import { localDate } from './dates'
import type { ActivityLevel, GoalHistory, Profile } from './model'

export const activityLevels: Record<ActivityLevel, [string, number]> = {
  sedentary: ['Prevažne sedavá', 1.2],
  light: ['Mierna', 1.375],
  moderate: ['Stredná', 1.55],
  high: ['Vysoká', 1.725],
  veryHigh: ['Veľmi vysoká', 1.9],
}

function fullYearsBetween(from: string, to: string) {
  return Number(to.slice(0, 4)) - Number(from.slice(0, 4)) - Number(to.slice(5) < from.slice(5))
}

export function ageAt(profile: Profile, date = localDate()) {
  const { age } = profile
  if (!age) return null
  return 'birthDate' in age ? fullYearsBetween(age.birthDate, date) : age.years + fullYearsBetween(age.asOf, date)
}

export function estimateRestingEnergy(profile: Profile, date = localDate()) {
  const { formulaSex, heightCm, weightKg } = profile
  const years = ageAt(profile, date)
  if (years === null || years < 18 || !formulaSex || !heightCm || !weightKg) return null
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * years + (formulaSex === 'male' ? 5 : -161)
  return bmr > 0 && Number.isFinite(bmr) ? bmr : null
}

export function estimateEnergy(profile: Profile, date = localDate()) {
  const resting = estimateRestingEnergy(profile, date)
  if (resting === null || !profile.activityLevel) return null
  const tdee = resting * activityLevels[profile.activityLevel][1]
  return tdee > 0 && Number.isFinite(tdee) ? tdee : null
}

export function estimateTarget(tdee: number, direction: GoalHistory['direction'], weeklyKg: number) {
  const adjustment = Math.min(Math.max(0, weeklyKg) * 7700 / 7, 300, tdee * 0.15)
  if (direction === 'lose') return Math.ceil(tdee - adjustment)
  return Math.round(tdee + (direction === 'gain' ? adjustment : 0))
}

export type NewGoal = Pick<GoalHistory, 'direction' | 'weeklyWeightChangeKg' | 'energyTargetKcal' | 'calculation' | 'calibrationEvidence'>

export function goalForDay(goals: readonly GoalHistory[], date: string) {
  return goals.reduce<GoalHistory | undefined>((best, goal) => {
    if (goal.validFrom > date || (goal.validUntil && date >= goal.validUntil)) return best
    return !best || goal.validFrom > best.validFrom
      || (goal.validFrom === best.validFrom && goal.confirmedAt > best.confirmedAt) ? goal : best
  }, undefined)
}

export async function confirmGoal(db: NutriTrackDatabase, proposed: NewGoal, date = localDate()) {
  if (!Number.isFinite(proposed.energyTargetKcal) || proposed.energyTargetKcal <= 0) {
    throw new Error('Zadajte kladný energetický cieľ.')
  }
  await db.transaction('rw', [db.profiles, db.goals], async () => {
    const profile = await db.profiles.get('local') ?? { id: 'local' as const }
    const goals = await db.goals.toArray()
    const active = goals.find(({ id }) => id === profile.activeGoalId)
    if (active && active.validFrom > date) throw new Error('Dátum zmeny predchádza dátumu posledného cieľa.')
    const current = goals.filter((goal) => !goal.validUntil || goal.validUntil > date)
    if (current.some((goal) => goal.validFrom > date)) throw new Error('V histórii už je cieľ s budúcim dátumom.')
    for (const goal of current) await db.goals.update(goal.id, { validUntil: date })
    const id = crypto.randomUUID()
    await db.goals.add({ ...proposed, id, validFrom: date, confirmedAt: new Date().toISOString() })
    await db.profiles.put({ ...profile, activeGoalId: id })
  })
}

export async function saveProfile(db: NutriTrackDatabase, values: Omit<Profile, 'id' | 'activeGoalId'>) {
  await db.transaction('rw', db.profiles, async () => {
    const previous = await db.profiles.get('local')
    const activeGoalId = previous?.activeGoalId
    await db.profiles.put({ ...values, id: 'local', ...(activeGoalId ? { activeGoalId } : {}) })
  })
}
