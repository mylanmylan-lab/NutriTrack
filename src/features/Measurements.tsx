import { useState } from 'react'
import { measurementPoints } from '../data/analysis'
import { database } from '../data/database'
import { dateLabel, decimal, isLocalDate, localDate, numberLabel, requiredDecimal } from '../data/dates'
import type { ActivityEntry, BodyMeasurement } from '../data/model'
import { DecimalField, Form, RemoveButton, textValue, useQuery } from './shared'

function readDate(data: FormData) {
  const date = textValue(data, 'date')
  if (!isLocalDate(date)) throw new Error('Vyberte platný dátum.')
  return date
}

function MeasurementEditor({ measurement, finish }: { measurement?: BodyMeasurement | undefined; finish: () => void }) {
  return (
    <Form onSave={async (data) => {
      const date = readDate(data)
      const weightKg = decimal(textValue(data, 'weight'), 'Hmotnosť')
      const waistCm = decimal(textValue(data, 'waist'), 'Obvod pásu')
      const note = textValue(data, 'note')
      if (weightKg === undefined && waistCm === undefined) throw new Error('Zadajte hmotnosť alebo obvod pásu.')
      const entry: BodyMeasurement = {
        id: measurement?.id ?? crypto.randomUUID(), date,
        ...(weightKg === undefined ? {} : { weightKg }),
        ...(waistCm === undefined ? {} : { waistCm }),
        ...(note ? { note } : {}),
      }
      if (measurement) {
        await database.transaction('rw', database.bodyMeasurements, async () => {
          if (!(await database.bodyMeasurements.get(measurement.id))) throw new Error('Meranie už nie je dostupné.')
          await database.bodyMeasurements.put(entry)
        })
      } else await database.bodyMeasurements.add(entry)
      finish()
    }}>
      <div className="field-grid">
        <label className="field"><span>Dátum merania</span><input type="date" name="date" defaultValue={measurement?.date ?? localDate()} required /></label>
        <DecimalField label="Hmotnosť (kg)" name="weight" defaultValue={measurement?.weightKg} />
        <DecimalField label="Obvod pásu (cm)" name="waist" defaultValue={measurement?.waistCm} />
        <label className="field"><span>Poznámka</span><input name="note" defaultValue={measurement?.note} /></label>
      </div>
      <div className="actions">
        <button className="button" type="submit">Uložiť meranie</button>
        <button className="button secondary" type="button" onClick={finish}>Zrušiť</button>
      </div>
    </Form>
  )
}

function ActivityEditor({ activity, finish }: { activity?: ActivityEntry | undefined; finish: () => void }) {
  return (
    <Form onSave={async (data) => {
      const date = readDate(data)
      const type = textValue(data, 'type')
      if (!type) throw new Error('Zadajte druh aktivity.')
      const durationMinutes = requiredDecimal(textValue(data, 'minutes'), 'Trvanie')
      const estimatedEnergyKcal = decimal(textValue(data, 'energy'), 'Odhad výdaja', true)
      const entry: ActivityEntry = {
        id: activity?.id ?? crypto.randomUUID(), date, type, durationMinutes, accounting: 'includedInActivityLevel',
        ...(estimatedEnergyKcal === undefined ? {} : { estimatedEnergyKcal }),
      }
      if (activity) {
        entry.accounting = activity.accounting
        await database.transaction('rw', database.activities, async () => {
          if (!(await database.activities.get(activity.id))) throw new Error('Aktivita už nie je dostupná.')
          await database.activities.put(entry)
        })
      } else await database.activities.add(entry)
      finish()
    }}>
      <div className="field-grid">
        <label className="field"><span>Dátum aktivity</span><input type="date" name="date" defaultValue={activity?.date ?? localDate()} required /></label>
        <label className="field"><span>Druh aktivity</span><input name="type" defaultValue={activity?.type} required /></label>
        <DecimalField label="Trvanie (min)" name="minutes" defaultValue={activity?.durationMinutes} required />
        <DecimalField label="Odhad výdaja (kcal)" name="energy" defaultValue={activity?.estimatedEnergyKcal} />
      </div>
      <p>Záznam aktivity slúži na evidenciu. Odhad výdaja z aktivity nemení potvrdený cieľ.</p>
      <div className="actions">
        <button className="button" type="submit">Uložiť aktivitu</button>
        <button className="button secondary" type="button" onClick={finish}>Zrušiť</button>
      </div>
    </Form>
  )
}

function Plot({ measurements, field, title, unit }: {
  measurements: BodyMeasurement[]; field: 'weightKg' | 'waistCm'; title: string; unit: string
}) {
  const points = measurementPoints(measurements, field)
  const first = points[0]
  const last = points.at(-1)
  if (!first || !last) return null
  if (points.length === 1) return <p>{title} pri poslednom meraní · {numberLabel(last.value)} {unit}</p>

  const low = Math.min(...points.map(({ value }) => value))
  const high = Math.max(...points.map(({ value }) => value))
  const start = Date.parse(first.date)
  const end = Date.parse(last.date)
  const getX = (date: string) => end === start ? 50 : 3 + 94 * (Date.parse(date) - start) / (end - start)
  const getY = (value: number) => high === low ? 50 : 8 + 84 * (high - value) / (high - low)
  return (
    <figure className="form-stack">
      <figcaption><strong>{title}</strong> · {numberLabel(first.value)} → {numberLabel(last.value)} {unit}</figcaption>
      <div className="plot" role="img" aria-label={`${title}, ${points.length} meraní, ${numberLabel(low)} až ${numberLabel(high)} ${unit}`}>
        {points.map(({ date, value }, index) => (
          <span key={index} aria-hidden="true" title={`${dateLabel(date)} · ${numberLabel(value)} ${unit}`}
            style={{ left: `${getX(date)}%`, top: `${getY(value)}%` }} />
        ))}
      </div>
      <div className="plot-dates"><span>{dateLabel(first.date)}</span><span>{dateLabel(last.date)}</span></div>
    </figure>
  )
}

export function MeasurementTrend({ measurements }: { measurements: BodyMeasurement[] }) {
  return (
    <section className="content-panel form-stack">
      <h2>Vývoj meraní</h2>
      {measurements.length === 0 && <p>V zvolenom období nie sú uložené merania.</p>}
      <Plot measurements={measurements} field="weightKg" title="Hmotnosť" unit="kg" />
      <Plot measurements={measurements} field="waistCm" title="Obvod pásu" unit="cm" />
    </section>
  )
}

export function Measurements() {
  const data = useQuery(() => database.transaction('r', [database.bodyMeasurements, database.activities], async () => {
    const [measurements, activities] = await Promise.all([
      database.bodyMeasurements.orderBy('date').reverse().toArray(),
      database.activities.orderBy('date').reverse().toArray(),
    ])
    return { measurements, activities }
  }))
  const [measurementId, setMeasurement] = useState<string | null>()
  const [activityId, setActivity] = useState<string | null>()
  if (!data) return <p role="status">Načítavam merania…</p>
  const { measurements, activities } = data

  return (
    <>
      <section className="content-panel form-stack">
        <h2>Hmotnosť a obvod pásu</h2>
        {measurementId === undefined
          ? <button className="button" type="button" onClick={() => setMeasurement(null)}>Pridať meranie</button>
          : <MeasurementEditor key={measurementId ?? 'new'} measurement={measurements.find(({ id }) => id === measurementId)}
              finish={() => setMeasurement(undefined)} />}
        {measurements.length === 0 && <p>Zatiaľ tu nie sú uložené merania.</p>}
        <ul className="item-list">
          {measurements.map((measurement) => (
            <li key={measurement.id} className="item-row">
              <div className="item-label">
                <strong>{dateLabel(measurement.date)}</strong>
                <p>{[
                  measurement.weightKg === undefined ? null : `${numberLabel(measurement.weightKg)} kg`,
                  measurement.waistCm === undefined ? null : `${numberLabel(measurement.waistCm)} cm`,
                ].filter(Boolean).join(' · ')}</p>
                {measurement.note && <p>{measurement.note}</p>}
              </div>
              <div className="actions">
                <button className="button secondary" type="button" onClick={() => setMeasurement(measurement.id)}>Upraviť meranie</button>
                <RemoveButton label="Zmazať meranie" message="Zmazať toto meranie?" remove={async () => {
                  await database.bodyMeasurements.delete(measurement.id)
                  if (measurementId === measurement.id) setMeasurement(undefined)
                }} />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="content-panel form-stack">
        <h2>Aktivity</h2>
        {activityId === undefined
          ? <button className="button" type="button" onClick={() => setActivity(null)}>Pridať aktivitu</button>
          : <ActivityEditor key={activityId ?? 'new'} activity={activities.find(({ id }) => id === activityId)}
              finish={() => setActivity(undefined)} />}
        {activities.length === 0 && <p>Zatiaľ tu nie sú zapísané aktivity.</p>}
        <ul className="item-list">
          {activities.map((activity) => (
            <li key={activity.id} className="item-row">
              <div className="item-label">
                <strong>{activity.type}</strong>
                <p>{dateLabel(activity.date)} · {numberLabel(activity.durationMinutes)} min
                  {activity.estimatedEnergyKcal === undefined ? '' : ` · odhad ${numberLabel(activity.estimatedEnergyKcal)} kcal`}</p>
              </div>
              <div className="actions">
                <button className="button secondary" type="button" onClick={() => setActivity(activity.id)}>Upraviť aktivitu</button>
                <RemoveButton label="Zmazať aktivitu" message="Zmazať túto aktivitu?" remove={async () => {
                  await database.activities.delete(activity.id)
                  if (activityId === activity.id) setActivity(undefined)
                }} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
