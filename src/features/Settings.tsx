import { useEffect, useState } from 'react'
import { exportBackup, inspectBackup, restoreBackup } from '../data/backup'
import { daysCsv, mealsCsv, measurementsCsv } from '../data/csv'
import { database } from '../data/database'
import { dateLabel, decimal, isLocalDate, localDate, numberLabel } from '../data/dates'
import { activityLevels, confirmGoal, estimateEnergy, estimateRestingEnergy, estimateTarget, saveProfile } from '../data/goals'
import { addCategory, readCategories } from '../data/journal'
import type { ActivityLevel, GoalHistory, Profile } from '../data/model'
import { CatalogAttribution } from './FoodSources'
import { ActionError, DecimalField, Form, textValue, useAction, useQuery } from './shared'

const directions = { lose: 'Mierna redukcia', maintain: 'Udržanie hmotnosti', gain: 'Priberanie' } as const
const methods = { manual: 'Ručný cieľ', mifflinStJeor: 'Odhad Mifflin–St Jeor', calibrated: 'Kalibrovaný cieľ' } as const

function ProfileEditor({ profile }: { profile: Profile }) {
  const [saved, setSaved] = useState(false)
  const age = profile.age
  return (
    <section className="content-panel form-stack">
      <h2>Profil</h2>
      <Form key={JSON.stringify(profile)} onSave={async (data) => {
        const birthDate = textValue(data, 'birthDate')
        const years = decimal(textValue(data, 'age'), 'Vek', true)
        if (birthDate && (!isLocalDate(birthDate) || birthDate > localDate())) throw new Error('Skontrolujte dátum narodenia.')
        if (birthDate && years !== undefined) throw new Error('Vyplňte vek alebo dátum narodenia.')
        if (years !== undefined && !Number.isSafeInteger(years)) throw new Error('Vek zadajte v celých rokoch.')
        const heightCm = decimal(textValue(data, 'height'), 'Výška')
        const weightKg = decimal(textValue(data, 'weight'), 'Hmotnosť')
        const formulaSex = textValue(data, 'formulaSex')
        const activity = textValue(data, 'activity')
        const nextAge = birthDate ? { birthDate } : years === undefined ? undefined
          : { years, asOf: age && 'years' in age && age.years === years ? age.asOf : localDate() }
        await saveProfile(database, {
          ...(nextAge ? { age: nextAge } : {}),
          ...(heightCm === undefined ? {} : { heightCm }),
          ...(weightKg === undefined ? {} : { weightKg }),
          ...(formulaSex === 'male' || formulaSex === 'female' ? { formulaSex } : {}),
          ...(Object.hasOwn(activityLevels, activity) ? { activityLevel: activity as ActivityLevel } : {}),
        })
        setSaved(true)
      }}>
        <div className="field-grid">
          <DecimalField label="Vek v rokoch" name="age" defaultValue={age && 'years' in age ? age.years : undefined} />
          <label className="field"><span>Dátum narodenia</span>
            <input name="birthDate" type="date" max={localDate()} defaultValue={age && 'birthDate' in age ? age.birthDate : ''} />
          </label>
          <label className="field"><span>Pohlavie pre výpočet</span>
            <select name="formulaSex" defaultValue={profile.formulaSex ?? ''}>
              <option value="">Neuvedené</option><option value="female">Ženské</option><option value="male">Mužské</option>
            </select>
          </label>
          <label className="field"><span>Úroveň aktivity</span>
            <select name="activity" defaultValue={profile.activityLevel ?? ''}>
              <option value="">Neuvedená</option>
              {Object.entries(activityLevels).map(([id, [label]]) => <option value={id} key={id}>{label}</option>)}
            </select>
          </label>
          <DecimalField label="Výška (cm)" name="height" defaultValue={profile.heightCm} />
          <DecimalField label="Hmotnosť pre výpočet (kg)" name="weight" defaultValue={profile.weightKg} />
        </div>
        <div className="actions">
          <button className="button" type="submit">Uložiť profil</button>
          {saved && <p role="status">Profil je uložený.</p>}
        </div>
      </Form>
    </section>
  )
}

type Proposal = Parameters<typeof confirmGoal>[1]

function Goals({ profile, goals }: { profile: Profile; goals: GoalHistory[] }) {
  const [proposal, setProposal] = useState<Proposal>()
  const action = useAction()
  const tdee = estimateEnergy(profile)
  const active = goals.find(({ id }) => id === profile.activeGoalId)
  return (
    <section className="content-panel form-stack">
      <h2>Energetický cieľ</h2>
      <p>{active ? `Potvrdený cieľ: ${numberLabel(active.energyTargetKcal)} kcal za deň.` : 'Zatiaľ nemáte potvrdený cieľ.'}</p>
      <p>{tdee === null ? 'Na odhad výdaja dospelého vyplňte vek, pohlavie, výšku, hmotnosť a úroveň aktivity.'
        : `Odhad denného výdaja podľa Mifflin–St Jeor: ${numberLabel(Math.round(tdee))} kcal.`}</p>
      <p>Automatický návrh obmedzuje dennú zmenu na najviac 300 kcal a 15 % odhadovaného výdaja.</p>
      <Form onSave={async (data) => {
        const direction = textValue(data, 'direction') as GoalHistory['direction']
        if (!Object.hasOwn(directions, direction)) throw new Error('Vyberte smer cieľa.')
        const weekly = direction === 'maintain' ? 0 : decimal(textValue(data, 'weekly'), 'Zmena za týždeň', true) ?? 0
        const manual = decimal(textValue(data, 'manual'), 'Ručný cieľ')
        if (manual === undefined && tdee === null) throw new Error('Uveďte ručný cieľ alebo doplňte profil.')
        const target = manual ?? estimateTarget(tdee!, direction, weekly)
        if (target <= 0 || !Number.isFinite(target)) throw new Error('Upravte týždennú zmenu alebo zadajte kladný ručný cieľ.')
        if (manual === undefined && direction === 'lose') {
          const resting = estimateRestingEnergy(profile) ?? 0
          const lowBmi = Boolean(profile.heightCm && profile.weightKg && profile.weightKg / (profile.heightCm / 100) ** 2 < 18.5)
          if (lowBmi || target < Math.max(resting, 1200)) throw new Error('Pre tento profil aplikácia automatický redukčný cieľ nenavrhne.')
        }
        const effectiveWeekly = manual === undefined && tdee !== null && direction !== 'maintain'
          ? Math.abs(tdee - target) * 7 / 7700 : weekly
        setProposal({ direction, weeklyWeightChangeKg: effectiveWeekly, energyTargetKcal: target, calculation: manual === undefined ? 'mifflinStJeor' : 'manual' })
      }}>
        <div className="field-grid">
          <label className="field"><span>Smer cieľa</span>
            <select name="direction" defaultValue={active?.direction ?? 'lose'}>
              {Object.entries(directions).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <DecimalField label="Zmena za týždeň (kg)" name="weekly" defaultValue={active?.weeklyWeightChangeKg ?? 0.25} />
          <DecimalField label="Ručný cieľ (kcal/deň)" name="manual" defaultValue={active?.calculation === 'manual' ? active.energyTargetKcal : undefined} />
        </div>
        <button className="button secondary" type="submit" disabled={action.busy}>Zobraziť návrh cieľa</button>
      </Form>
      {proposal && (
        <section className="sub-panel form-stack" aria-label="Návrh energetického cieľa">
          <p><strong>{numberLabel(proposal.energyTargetKcal)} kcal za deň</strong> · {directions[proposal.direction]} · {methods[proposal.calculation]}</p>
          <div className="actions">
            <button className="button" type="button" disabled={action.busy} onClick={() => void action.run(async () => {
              await confirmGoal(database, proposal)
              setProposal(undefined)
            })}>Potvrdiť cieľ</button>
            <button className="button secondary" type="button" disabled={action.busy} onClick={() => setProposal(undefined)}>Zrušiť návrh</button>
          </div>
          <ActionError message={action.error} />
        </section>
      )}
      {goals.length > 0 && (
        <details>
          <summary>História potvrdených cieľov</summary>
          <ul className="item-list">
            {goals.map((goal) => (
              <li key={goal.id}>
                {dateLabel(goal.validFrom)}{goal.validUntil ? ` – do ${dateLabel(goal.validUntil)}` : ''}
                {' · '}{numberLabel(goal.energyTargetKcal)} kcal · {methods[goal.calculation]}
                {goal.calibrationEvidence && <p>Podklady {dateLabel(goal.calibrationEvidence.start)} – {dateLabel(goal.calibrationEvidence.end)}
                  {' · '}{goal.calibrationEvidence.intakeDays} dní s príjmom · {goal.calibrationEvidence.weighDays} dní s vážením
                  {' · odhad výdaja '}{numberLabel(goal.calibrationEvidence.estimatedExpenditureKcal)} kcal/deň</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function Categories() {
  const categories = useQuery(() => readCategories(database))
  return (
    <section className="content-panel form-stack">
      <h2>Kategórie jedál</h2>
      {categories && <ul className="category-list">{categories.map(({ id, name }) => <li key={id}>{name}</li>)}</ul>}
      <Form onSave={async (data) => { await addCategory(database, textValue(data, 'name')) }}>
        <label className="field"><span>Názov vlastnej kategórie</span><input name="name" required /></label>
        <button className="button secondary" type="submit">Pridať kategóriu</button>
      </Form>
    </section>
  )
}

function Appearance() {
  const prefs = useQuery(() => database.preferences.get('local').then((record) => record?.theme ?? 'system'))
  const action = useAction()

  return (
    <section className="content-panel form-stack">
      <h2>Vzhľad</h2>
      <label className="field"><span>Téma</span>
        <select value={prefs ?? 'system'} disabled={prefs === undefined || action.busy} onChange={(event) => {
          const theme = event.target.value
          if (theme !== 'system' && theme !== 'light' && theme !== 'dark') return
          void action.run(async () => { await database.preferences.put({ id: 'local', theme }) })
        }}>
          <option value="system">Podľa systému</option><option value="light">Svetlá</option><option value="dark">Tmavá</option>
        </select>
      </label>
      <ActionError message={action.error} />
    </section>
  )
}

const countLabels = {
  profiles: 'Profily', preferences: 'Nastavenia', foods: 'Potraviny', servings: 'Veľkosti porcií',
  recipes: 'Recepty', mealCombinations: 'Kombinácie jedál', mealCategories: 'Vlastné kategórie', mealEntries: 'Zápisy jedál', bodyMeasurements: 'Merania',
  activities: 'Aktivity', goals: 'Ciele', journalDays: 'Označené dni', lastServings: 'Posledné porcie',
} as const

function Transfers() {
  const action = useAction()
  const [file, setFile] = useState<File>()
  const [url, setUrl] = useState('')
  const [candidate, setCandidate] = useState<{ text: string; preview: Awaited<ReturnType<typeof inspectBackup>> }>()
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    if (!file) return
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  function prepare(name: string, type: string, generate: () => Promise<string>) {
    void action.run(async () => {
      const value = await generate()
      setUrl('')
      setFile(new File([value], name, { type }))
    })
  }

  return (
    <section className="content-panel form-stack">
      <h2>Zálohy a export</h2>
      <p>Prehliadač môže odstrániť lokálne údaje. Pravidelne ukladajte JSON zálohu do Súborov na iPhone alebo na iné úložisko.</p>
      <div className="actions">
        <button className="button" type="button" disabled={action.busy}
          onClick={() => prepare(`NutriTrack-${localDate()}.json`, 'application/json', () => exportBackup(database))}>Pripraviť JSON zálohu</button>
        <button className="button secondary" type="button" disabled={action.busy}
          onClick={() => prepare('NutriTrack-jedla.csv', 'text/csv;charset=utf-8', () => mealsCsv(database))}>CSV jedál</button>
        <button className="button secondary" type="button" disabled={action.busy}
          onClick={() => prepare('NutriTrack-denne-sucty.csv', 'text/csv;charset=utf-8', () => daysCsv(database))}>CSV denných súčtov</button>
        <button className="button secondary" type="button" disabled={action.busy}
          onClick={() => prepare('NutriTrack-merania.csv', 'text/csv;charset=utf-8', () => measurementsCsv(database))}>CSV meraní</button>
      </div>
      {file && url && (
        <div className="actions">
          <a className="button" href={url} download={file.name}>Stiahnuť {file.name}</a>
          {navigator.canShare?.({ files: [file] }) && (
            <button className="button secondary" type="button" disabled={action.busy} onClick={() => void action.run(async () => {
              try {
                await navigator.share({ files: [file], title: 'NutriTrack' })
              } catch (error) {
                if (!(error instanceof DOMException && error.name === 'AbortError')) throw new Error('Súbor sa nepodarilo zdieľať.')
              }
            })}>Zdieľať súbor</button>
          )}
        </div>
      )}
      <div className="sub-panel form-stack">
        <h3>Obnova zo zálohy</h3>
        <label className="field"><span>Otvoriť JSON zálohu</span>
          <input type="file" accept=".json,application/json" disabled={action.busy} onChange={(event) => {
            const selected = event.target.files?.[0]
            event.target.value = ''
            setCandidate(undefined)
            setRestored(false)
            if (selected) void action.run(async () => {
              const text = await selected.text()
              setCandidate({ text, preview: await inspectBackup(text) })
            })
          }} />
        </label>
        {candidate && (
          <section className="form-stack" aria-label="Náhľad zálohy">
            <p>Záloha z {dateLabel(localDate(new Date(candidate.preview.exportedAt)))} nahradí súčasné údaje.</p>
            <dl className="nutrient-list">
              {Object.entries(countLabels).map(([key, label]) => (
                <div key={key}><dt>{label}</dt><dd>{candidate.preview.counts[key as keyof typeof countLabels]}</dd></div>
              ))}
            </dl>
            <div className="actions">
              <button className="button" type="button" disabled={action.busy} onClick={() => void action.run(async () => {
                await restoreBackup(database, candidate.text)
                setCandidate(undefined)
                setRestored(true)
              })}>Obnoviť a prepísať údaje</button>
              <button className="button secondary" type="button" disabled={action.busy} onClick={() => setCandidate(undefined)}>Zrušiť obnovu</button>
            </div>
          </section>
        )}
        {restored && <p role="status">Záloha je obnovená.</p>}
      </div>
      <ActionError message={action.error} />
    </section>
  )
}

export default function Settings() {
  const data = useQuery(() => database.transaction('r', [database.profiles, database.goals], async () => ({
    profile: await database.profiles.get('local') ?? { id: 'local' as const },
    goals: (await database.goals.toArray()).sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt)),
  })))
  if (!data) return <p role="status">Načítavam nastavenia…</p>

  const { profile, goals } = data
  return (
    <>
      <ProfileEditor profile={profile} />
      <Goals key={JSON.stringify(profile)} profile={profile} goals={goals} />
      <Categories />
      <Appearance />
      <Transfers />
      <section className="content-panel form-stack">
        <h2>Zdroje živín</h2>
        <p>Údaje vlastných potravín pochádzajú zo zadania používateľa, napríklad z etikety výrobku.</p>
        <CatalogAttribution />
      </section>
    </>
  )
}
