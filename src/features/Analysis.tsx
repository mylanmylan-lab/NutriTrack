import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { analyzePeriod, buildDays, readAnalysisWindow, type AnalysisPeriod, type PeriodAnalysis } from '../data/analysis'
import { database } from '../data/database'
import { dateLabel, localDate, numberLabel, shiftDay } from '../data/dates'
import { nutrientLabel } from '../data/nutrition'
import { observations } from '../data/recommendations'
import { adultReferences, efsaChloride, efsaSodium, efsaSummary, type IntakeReference } from '../data/references'
import { Calibration } from './Calibration'
import { DatePicker, DayAnalysis, useDiaryDate } from './Diary'
import { MeasurementTrend } from './Measurements'
import { useQuery } from './shared'

function perDay(value: number | null, unit = 'kcal') {
  return value === null ? 'Údaj nie je dostupný' : `${numberLabel(unit === 'kcal' ? Math.round(value) : value)} ${unit}/deň`
}

function signed(value: number) {
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : ''}${numberLabel(rounded)}`
}

function EnergyPanel({ data }: { data: PeriodAnalysis }) {
  const macro = data.nutrients.filter(({ id, unit }) => unit === 'g' && ['protein', 'carbohydrates', 'fat', 'fiber'].includes(id))
  return (
    <section className="content-panel form-stack" aria-label="Priemerný denný príjem">
      <h2>Priemerný denný príjem</h2>
      <dl className="summaries">
        <div><dt>Energia</dt><dd>{perDay(data.energy.average)}</dd><dd><small>{data.energy.days} z {data.completeDays} kompletných dní s úplnou energiou</small></dd></div>
        <div><dt>Bilancia oproti cieľu</dt><dd>{data.goal.averageDifference === null ? 'Údaj nie je dostupný' : `${signed(data.goal.averageDifference)} kcal/deň`}</dd>
          <dd><small>{data.goal.days} dní s platným cieľom{data.goal.averageTarget === null ? '' : ` · priemerný cieľ ${perDay(data.goal.averageTarget)}`}</small></dd></div>
        {macro.map((row) => (
          <div key={row.id}>
            <dt>{nutrientLabel(row.id)}</dt><dd>{perDay(row.average, row.unit)}</dd>
            <dd><small>{row.fullDays} z {row.totalDays} kompletných dní s úplným údajom</small></dd>
            {row.coverage === 'partial' && <dd><small>Čiastkový záznam v období · {perDay(row.recordedAverage, row.unit)}</small></dd>}
          </div>
        ))}
      </dl>
      <dl className="nutrient-list">
        <div><dt>Pracovné dni (Po – Pi)</dt><dd>{perDay(data.weekday.average)}<small>Použiteľné dni · {data.weekday.days}</small></dd></div>
        <div><dt>Víkendy (So – Ne)</dt><dd>{perDay(data.weekend.average)}<small>Použiteľné dni · {data.weekend.days}</small></dd></div>
      </dl>
      <details>
        <summary>Týždenné priemery</summary>
        {data.weeks.length === 0 ? <p>Údaj nie je dostupný.</p> : <dl className="nutrient-list">
          {data.weeks.map((week) => <div key={week.date}><dt>Týždeň od {dateLabel(week.date)}</dt><dd>{perDay(week.average)}<small>Použiteľné dni · {week.days}</small></dd></div>)}
        </dl>}
      </details>
    </section>
  )
}

function EnergySources({ data }: { data: PeriodAnalysis }) {
  const total = data.categories.reduce((sum, row) => sum + row.kcal, 0)
  return (
    <section className="content-panel form-stack">
      <h2>Zdroje energie</h2>
      {total > 0 ? <>
        <h3>Podiel podľa kategórie jedál</h3>
        <ul className="item-list energy-bars">
          {data.categories.map(({ key, name, kcal }) => {
            const share = kcal / total * 100
            return <li key={key}>
              <div><span>{name}</span><strong>{numberLabel(Math.round(share * 10) / 10)} %</strong></div>
              <span className="energy-track" aria-hidden="true"><span style={{ width: `${share}%` }} /></span>
            </li>
          })}
        </ul>
        <h3>Najvýznamnejšie potraviny a recepty</h3>
        <dl className="nutrient-list">
          {data.sources.slice(0, 8).map(({ key, name, kcal, count }) => (
            <div key={key}><dt>{name}</dt><dd>{numberLabel(Math.round(kcal))} kcal<small>Počet zápisov · {count}</small></dd></div>
          ))}
        </dl>
        {data.sourcesAboveGoal.length > 0 && <details>
          <summary>Zdroje energie v dňoch nad cieľom ({data.goal.exceeded})</summary>
          <dl className="nutrient-list">
            {data.sourcesAboveGoal.slice(0, 5).map(({ key, name, kcal }) => <div key={key}><dt>{name}</dt><dd>{numberLabel(Math.round(kcal))} kcal spolu</dd></div>)}
          </dl>
        </details>}
      </> : <p>Na určenie podielov je potrebný kompletný deň so zaznamenanou energiou.</p>}
    </section>
  )
}

function MicroPanel({ data, references }: { data: PeriodAnalysis; references: Record<string, IntakeReference> }) {
  const rows = data.nutrients.filter(({ id }) => ['choline', 'sodium', 'calcium', 'iron', 'magnesium', 'phosphorus',
    'potassium', 'zinc', 'copper', 'manganese', 'selenium', 'iodine', 'fluoride', 'chromium', 'molybdenum', 'chloride'].includes(id)
    || id.startsWith('vitamin'))
  const hasReference = Object.keys(references).length > 0
  return (
    <section className="content-panel form-stack" aria-label="Vitamíny a minerály">
      <h2>Vitamíny a minerály</h2>
      {!hasReference && <p>Na výber referencie pre dospelého doplňte vek a pohlavie v profile.</p>}
      {hasReference && <p>Referencie EFSA pre bežnú dospelú populáciu podľa veku a pohlavia, mimo tehotenstva a dojčenia. PRI je populačný referenčný príjem, AI je primeraný príjem. Porovnanie je orientačné.</p>}
      <details>
        <summary>Príjem a pokrytie jednotlivých živín</summary>
        <p>Čiastkový súčet vyjadruje zaznamenané minimum na kompletný deň. Pri chýbajúcich údajoch je príjem neistý a percento sa nezobrazuje.</p>
        <dl className="nutrient-list">
          {rows.map((row) => {
            const ref = references[row.id]
            const comparable = ref && !ref.caveat && ref.unit === row.unit && row.coverage === 'covered' && row.average !== null
            return (
              <div key={`${row.id}/${row.unit}`}>
                <dt>{nutrientLabel(row.id)}{row.unit === 'IU' ? ' (IU)' : ''}
                  {ref && <small>{ref.kind} · {numberLabel(ref.value)}{ref.upper === undefined ? '' : ` – ${numberLabel(ref.upper)}`} {ref.unit}{ref.unit.endsWith('/MJ') ? '' : '/deň'}</small>}
                  {ref?.caveat && <small>{ref.caveat}</small>}
                </dt>
                <dd>
                  {row.coverage === 'missing' ? 'Údaj nie je dostupný' : perDay(row.recordedAverage, row.unit)}
                  <small>{row.coverage === 'covered' ? 'Dostatočne pokrytý údaj' : row.coverage === 'partial' ? 'Čiastkový súčet · neistý údaj' : 'Chýbajúci údaj'}
                    {' · '}{row.fullDays}/{row.totalDays} dní s úplným údajom</small>
                  {comparable && <small>{numberLabel(Math.round(row.average! / ref.value * 100))} % referencie</small>}
                  {hasReference && !ref && <small>Referencia pre tento záznam nie je dostupná.</small>}
                </dd>
              </div>
            )
          })}
        </dl>
      </details>
      <p><a className="text-link" href={efsaSummary} target="_blank" rel="noreferrer">Zdroj EFSA · tabuľky referenčných príjmov</a>
        {' · '}<a className="text-link" href={efsaSodium} target="_blank" rel="noreferrer">Sodík</a>
        {' · '}<a className="text-link" href={efsaChloride} target="_blank" rel="noreferrer">Chlorid</a>
      </p>
    </section>
  )
}

function HabitsPanel({ data }: { data: PeriodAnalysis }) {
  return (
    <section className="content-panel form-stack">
      <h2>Stravovacie návyky</h2>
      <p>Porovnania používajú kompletné dni so známou energiou. Dôvody a typy jedál sú voliteľné a môžu sa prekrývať. Večerné občerstvenie zahŕňa občerstvenie a označené typy jedál či nápojov od 20:00.</p>
      <details>
        <summary>Časy, dôvody a označené potraviny</summary>
        <h3>Energia podľa času zápisu</h3>
        <dl className="nutrient-list">
          {data.times.map(({ label, entries, kcal }) => <div key={label}>
            <dt>{label}</dt><dd>{entries ? `${numberLabel(Math.round(kcal))} kcal spolu` : 'Bez zápisu'}<small>Počet zápisov · {entries}</small></dd>
          </div>)}
        </dl>
        <h3>Situácie pri jedle</h3>
        <dl className="nutrient-list">
          {data.habits.map((row) => (
            <div key={row.key}>
              <dt>{row.label}</dt>
              <dd>{row.entries ? `${numberLabel(Math.round(row.kcal))} kcal spolu · ${row.entries} zápisov` : 'Bez takého zápisu'}
                <small>{row.days >= 2 && row.otherDays >= 2
                  ? `Denný priemer ${perDay(row.withAverage)} (${row.days} dní), ostatné dni ${perDay(row.otherAverage)} (${row.otherDays} dní)`
                  : 'Na porovnanie je zatiaľ málo dní.'}</small>
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  )
}

function Coverage({ data }: { data: PeriodAnalysis }) {
  return (
    <details className="content-panel">
      <summary>Neúplné dni a pokrytie obdobia</summary>
      <p>{data.incomplete.length} čiastočne zaznamenaných alebo označených neúplných dní · {data.emptyDays} dní bez záznamu · {data.completeWithoutEnergy.length} kompletných dní s chýbajúcou energiou.</p>
      <ul className="item-list">
        {[...data.incomplete, ...data.completeWithoutEnergy].sort((a, b) => b.date.localeCompare(a.date)).map((day) => (
          <li className="item-row" key={day.date}>
            <Link className="text-link" to={`/dennik?datum=${day.date}`}>{dateLabel(day.date)}</Link>
            <span>{day.completeness === 'complete' ? 'Chýba úplná energia' : 'Neúplná evidencia'}
              {' · '}{day.recordedKcal === null ? 'Údaj nie je dostupný' : `zapísaných ${numberLabel(Math.round(day.recordedKcal))} kcal`}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

export default function Analysis() {
  const { date, setDate } = useDiaryDate()
  const [period, setPeriod] = useState<AnalysisPeriod>(30)
  const end = date > localDate() ? localDate() : date
  const start = shiftDay(end, 1 - period)
  const window = useQuery(() => readAnalysisWindow(database, start, end), [start, end])
  const data = useMemo(() => window && analyzePeriod(
    buildDays(start, end, window.entries, window.status), window.goals,
    new Map(window.categories.map(({ id, name }) => [id, name])),
  ), [window, start, end])
  const references = adultReferences(window?.profile, end)
  const advice = data ? observations(data, Boolean(references.fiber)) : []
  return (
    <>
      <section className="content-panel form-stack">
        <div className="actions" role="group" aria-label="Obdobie analýzy">
          {([7, 30, 90] as const).map((days) => (
            <button key={days} className={`button${period === days ? '' : ' secondary'}`} type="button"
              aria-pressed={period === days} onClick={() => setPeriod(days)}>{days} dní</button>
          ))}
        </div>
        <DatePicker date={end} setDate={setDate} max={localDate()} />
        <p>{dateLabel(start)} – {dateLabel(end)} · do priemerov vstupujú iba označené kompletné dni.</p>
      </section>
      {data && window ? <>
        <EnergyPanel data={data} />
        <Coverage data={data} />
        <EnergySources data={data} />
        <MeasurementTrend measurements={window.measurements} />
        <MicroPanel data={data} references={references} />
        <HabitsPanel data={data} />
        <section className="content-panel form-stack">
          <h2>Pozorovania a malé kroky</h2>
          {advice.length ? <ul className="item-list">
            {advice.map(({ title, evidence, next }) => <li key={title}><h3>{title}</h3><p>{evidence}</p><p>{next}</p></li>)}
          </ul> : <p>Z dostupných záznamov zatiaľ nevychádza dostatočne podložené odporúčanie.</p>}
        </section>
      </> : <p role="status">Načítavam obdobie…</p>}
      <Calibration />
      <DayAnalysis date={end} />
    </>
  )
}
