import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { database } from '../data/database'
import { dateLabel, isLocalDate, localDate, numberLabel, requiredDecimal } from '../data/dates'
import { goalForDay } from '../data/goals'
import { readMealLabels } from '../data/mealLabels'
import { MealLabelFields, MealLabelSummary } from './MealLabels'
import { copyMeal, editMeal, readCategories, saveCombination } from '../data/journal'
import type { GoalHistory, MealCategory, MealEntry, PortionAmount } from '../data/model'
import { nutrientLabel, packageFractions, sumNutrients, type NutrientTotal } from '../data/nutrition'
import { ActionError, CategoryField, DecimalField, Form, RemoveButton, textValue, useAction, useQuery } from './shared'

const core = new Set(['energy', 'protein', 'carbohydrates', 'fat'])
const missing = 'Údaj nie je dostupný'

function coverageLabel(row: NutrientTotal) {
  return row.known < row.total ? `Neúplný údaj · ${row.known}/${row.total} zápisov` : 'Neúplný údaj v recepte'
}

function totalValue(row: NutrientTotal) {
  return row.value === null ? missing : `${numberLabel(row.value)} ${row.unit}`
}

export function NutritionSummary({ entries, goal, detailed = false }: {
  entries: MealEntry[]
  goal?: GoalHistory | undefined
  detailed?: boolean
}) {
  const totals = sumNutrients(entries.map(({ snapshot }) => snapshot), true)
  const headline = totals.filter(({ id }) => core.has(id))
  const other = totals.filter(({ id, value }) => !core.has(id) && (id !== 'addedSugars' || value !== null))
  const details = (
    <dl className="nutrient-list">
      {other.map((row) => (
        <div key={`${row.id}/${row.unit}`}>
          <dt>{nutrientLabel(row.id)}</dt>
          <dd>{totalValue(row)} {row.value !== null && row.partial && <small>{coverageLabel(row)}</small>}</dd>
        </div>
      ))}
    </dl>
  )

  return (
    <section className="content-panel form-stack" aria-label="Denný súčet">
      <h2>Denný súčet</h2>
      <dl className="summaries">
        {headline.map((row) => (
          <div key={`${row.id}/${row.unit}`}>
            <dt>{nutrientLabel(row.id)}</dt>
            <dd>{totalValue(row)}</dd>
            {row.value !== null && row.partial && <dd><small>{coverageLabel(row)}</small></dd>}
          </div>
        ))}
      </dl>
      {goal && <p>Potvrdený cieľ {numberLabel(goal.energyTargetKcal)} kcal za deň.</p>}
      {detailed ? details : <details><summary>Ďalšie živiny</summary>{details}</details>}
    </section>
  )
}

function amountUnit(unit: Exclude<PortionAmount['unit'], 'packageFraction'>) {
  return unit === 'piece' ? 'ks' : unit === 'serving' ? 'porc.' : unit
}

function amountLabel(amount: PortionAmount) {
  if (amount.unit === 'packageFraction') return `${amount.numerator}/${amount.denominator} balenia`
  return `${numberLabel(amount.value)} ${amountUnit(amount.unit)}`
}

async function readDay(date: string) {
  return database.transaction('r', [database.mealEntries, database.journalDays, database.mealCategories, database.goals], async () => {
    const [entries, day, categories, goals] = await Promise.all([
      database.mealEntries.where('date').equals(date).toArray(),
      database.journalDays.get(date), readCategories(database),
      database.goals.where('validFrom').belowOrEqual(date).reverse().toArray(),
    ])
    return {
      entries: entries.sort((a, b) => a.time.localeCompare(b.time)),
      categories,
      day,
      goal: goalForDay(goals, date),
    }
  })
}

export function useDiaryDate() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('datum') ?? ''
  const date = isLocalDate(requested) ? requested : localDate()
  function setDate(value: string) {
    if (isLocalDate(value)) setParams({ datum: value })
  }
  return { date, setDate }
}

export function DatePicker({ date, setDate, max }: { date: string; setDate: (value: string) => void; max?: string }) {
  return (
    <label className="field date-picker">
      <span>Dátum prehľadu</span><input type="date" value={date} max={max} onChange={(event) => setDate(event.target.value)} />
    </label>
  )
}

function DayStatus({ date, complete }: { date: string; complete: boolean }) {
  const action = useAction()
  return (
    <div className="form-stack">
      <label className="check">
        <input type="checkbox" checked={complete} disabled={action.busy} onChange={(event) => {
          const completeness = event.target.checked ? 'complete' : 'incomplete'
          void action.run(async () => { await database.journalDays.put({ date, completeness }) })
        }} /> Deň je kompletne zaznamenaný
      </label>
      <ActionError message={action.error} />
    </div>
  )
}

export function Diary({ today = false }: { today?: boolean }) {
  const selection = useDiaryDate()
  const date = today ? localDate() : selection.date
  const data = useQuery(() => readDay(date), [date])
  if (!data) return <p role="status">Načítavam denník…</p>
  const { entries, categories, goal, day } = data

  return (
    <>
      <section className="content-panel day-heading">
        <div className="form-stack">
          {today ? <time dateTime={date}>{dateLabel(date)}</time> : <DatePicker date={date} setDate={selection.setDate} />}
          <DayStatus date={date} complete={day?.completeness === 'complete'} />
        </div>
        <Link className="button" to={today ? '/pridat' : `/pridat?datum=${date}`}>Pridať jedlo</Link>
      </section>
      <NutritionSummary entries={entries} goal={goal} />
      <section className="content-panel form-stack">
        <h2>Jedlá</h2>
        {entries.length === 0 && <p>Denník je prázdny.</p>}
        {categories.map((category) => {
          const meals = entries.filter((entry) => entry.categoryId === category.id)
          return meals.length ? <MealGroup key={category.id} name={category.name} entries={meals} categories={categories} combination={{ date, categoryId: category.id }} /> : null
        })}
        {entries.some((entry) => !categories.some(({ id }) => id === entry.categoryId)) && (
          <MealGroup name="Bez kategórie" entries={entries.filter((entry) => !categories.some(({ id }) => id === entry.categoryId))} categories={categories} />
        )}
      </section>
    </>
  )
}

function MealGroup({ name, entries, categories, combination }: {
  name: string; entries: MealEntry[]; categories: MealCategory[]
  combination?: { date: string; categoryId: string }
}) {
  return (
    <section className="form-stack meal-group">
      <h3>{name}</h3>
      {combination && <CombinationForm {...combination} />}
      <ul className="item-list">
        {entries.map((entry) => <MealRow key={entry.id} entry={entry} categories={categories} />)}
      </ul>
    </section>
  )
}

function CombinationForm({ date, categoryId }: { date: string; categoryId: string }) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  return (
    <div className="form-stack">
      {open ? <Form onSave={async (data) => {
        await saveCombination(database, textValue(data, 'combination'), date, categoryId)
        setOpen(false)
        setSaved(true)
      }}>
        <label className="field"><span>Názov kombinácie</span><input name="combination" required /></label>
        <div className="actions">
          <button type="submit" className="button">Uložiť kombináciu</button>
          <button type="button" className="button secondary" onClick={() => setOpen(false)}>Zrušiť</button>
        </div>
      </Form> : <button type="button" className="button secondary" onClick={() => {
        setOpen(true)
        setSaved(false)
      }}>Uložiť ako kombináciu</button>}
      {saved && <p role="status">Kombinácia je uložená.</p>}
    </div>
  )
}

function MealRow({ entry, categories }: { entry: MealEntry; categories: MealCategory[] }) {
  const [mode, setMode] = useState<'edit' | 'copy'>()
  const energy = sumNutrients([entry.snapshot]).find(({ id, unit }) => id === 'energy' && unit === 'kcal')
  return (
    <li className="meal-row">
      <div className="item-row">
        <div className="item-label">
          <strong>{entry.snapshot.name}</strong>
          <p>{entry.time} · {amountLabel(entry.amount)}{entry.snapshot.amount.estimated ? ' · odhad' : ''}</p>
          <MealLabelSummary labels={entry} />
        </div>
        <p>{energy ? totalValue(energy) : missing}</p>
      </div>
      <div className="actions">
        <button className="button secondary" type="button" onClick={() => setMode(mode === 'edit' ? undefined : 'edit')}>Upraviť záznam</button>
        <button className="button secondary" type="button" onClick={() => setMode(mode === 'copy' ? undefined : 'copy')}>Kopírovať</button>
        <RemoveButton label="Zmazať záznam" message={`Zmazať záznam „${entry.snapshot.name}“?`}
          remove={() => database.mealEntries.delete(entry.id)} />
      </div>
      {mode === 'edit' && (
        <Form onSave={async (data) => {
          const part = packageFractions.find(({ id }) => id === textValue(data, 'packageFraction'))
          const value = entry.amount.unit === 'packageFraction'
            ? part && { unit: 'packageFraction' as const, numerator: part.numerator, denominator: part.denominator }
            : requiredDecimal(textValue(data, 'quantity'), 'Množstvo')
          await editMeal(database, entry.id, {
            date: textValue(data, 'date'), time: textValue(data, 'time'), categoryId: textValue(data, 'categoryId'), ...readMealLabels(data),
          }, value)
          setMode(undefined)
        }}>
          <div className="field-grid">
            <label className="field"><span>Dátum</span><input type="date" name="date" defaultValue={entry.date} required /></label>
            <label className="field"><span>Čas</span><input type="time" name="time" defaultValue={entry.time} required /></label>
          </div>
          <CategoryField categories={categories} defaultValue={entry.categoryId} />
          {entry.amount.unit === 'packageFraction' ? (
            <label className="field"><span>Časť balenia</span>
              <select name="packageFraction" defaultValue="">
                <option value="">Ponechať {amountLabel(entry.amount)}</option>
                {packageFractions.map(({ id, label }) => <option value={id} key={id}>{label}</option>)}
              </select>
            </label>
          ) : <DecimalField name="quantity" label={`Množstvo (${amountUnit(entry.amount.unit)})`} defaultValue={entry.amount.value} required />}
          <MealLabelFields labels={entry} />
          <button className="button" type="submit">Uložiť záznam</button>
        </Form>
      )}
      {mode === 'copy' && (
        <Form onSave={async (data) => {
          await copyMeal(database, entry.id, textValue(data, 'target'))
          setMode(undefined)
        }}>
          <label className="field"><span>Kopírovať na dátum</span><input type="date" name="target" defaultValue={localDate()} required /></label>
          <button className="button" type="submit">Kopírovať záznam</button>
        </Form>
      )}
    </li>
  )
}

export function DayAnalysis({ date }: { date: string }) {
  const data = useQuery(() => readDay(date), [date])
  return (
    <>
      <section className="content-panel form-stack">
        <h2>Detail dňa · {dateLabel(date)}</h2>
        <p>{data?.day?.completeness === 'complete' ? 'Kompletne zaznamenaný deň.' : 'Deň nie je označený ako kompletne zaznamenaný.'}</p>
      </section>
      {data ? <NutritionSummary entries={data.entries} goal={data.goal} detailed /> : <p role="status">Načítavam súčty…</p>}
    </>
  )
}
