import { useState } from 'react'
import { Link } from 'react-router'
import { confirmCalibration, readCalibration } from '../data/calibration'
import { database } from '../data/database'
import { dateLabel, localDate, numberLabel } from '../data/dates'
import { ActionError, useAction, useQuery } from './shared'

export function Calibration() {
  const today = localDate()
  const result = useQuery(() => readCalibration(database, today), [today])
  const action = useAction()
  const [preview, setPreview] = useState<NonNullable<Extract<Awaited<ReturnType<typeof readCalibration>>, { status: 'ready' }>['proposal']>>()
  const [confirmed, setConfirmed] = useState(false)

  return (
    <section className="content-panel form-stack" aria-label="Kalibrácia energetického výdaja">
      <h2>Kalibrácia energetického výdaja</h2>
      <p>Odhad z profilu používa pokojový výdaj podľa Mifflin–St Jeor a zvolenú úroveň aktivity. Zápisy jednotlivých aktivít sa k nemu znova nepričítavajú.</p>
      <p>Kalibrácia pracuje s poslednými 56 ukončenými dňami. Zaznamenaný príjem vychádza z jedál a veľkosti porcií. Výdaj je odhad citlivý na presnosť zápisov a zmeny vody v tele.</p>
      {!result ? <p role="status">Kontrolujem podklady…</p> : result.status === 'insufficient' ? (
        <>
          {result.baselineKcal !== null && <p>Výdaj z profilu · {numberLabel(result.baselineKcal)} kcal/deň</p>}
          <p>Kalibrácia zatiaľ nie je dostupná. {result.reason}</p>
          <Link className="text-link" to="/nastavenia">Otvoriť profil a ciele</Link>
        </>
      ) : (
        <>
          <dl className="nutrient-list">
            <div><dt>Obdobie podkladov</dt><dd>{dateLabel(result.evidence.start)} – {dateLabel(result.evidence.end)}</dd></div>
            <div><dt>Kompletné dni s energiou</dt><dd>{result.evidence.intakeDays} z 56</dd></div>
            <div><dt>Dni s vážením</dt><dd>{result.evidence.weighDays}</dd></div>
            <div><dt>Priemerný zaznamenaný príjem</dt><dd>{numberLabel(result.evidence.observedIntakeKcal)} kcal/deň</dd></div>
            <div><dt>Energia z odhadnutých porcií</dt><dd>{numberLabel(Math.round(result.evidence.estimatedPortionEnergyShare * 100))} %</dd></div>
            <div><dt>Trend hmotnosti</dt><dd>{numberLabel(result.evidence.weightChangeKgPerWeek)} kg/týždeň</dd></div>
            <div><dt>Výdaj z profilu</dt><dd>{numberLabel(result.evidence.baselineKcal)} kcal/deň</dd></div>
            <div><dt>Kalibrovaný odhad výdaja</dt><dd>{numberLabel(result.evidence.estimatedExpenditureKcal)} kcal/deň</dd></div>
            <div><dt>Orientačná neistota</dt><dd>±{numberLabel(result.evidence.uncertaintyKcal)} kcal/deň</dd></div>
          </dl>
          <p>Týždenné mediány obmedzujú vplyv jednotlivých meraní. Aplikácia priblíži odhad z profilu k odhadu z denníka a zmenu obmedzí na najviac 150 kcal/deň.</p>
          {result.reason && <p>{result.reason}</p>}
          {result.proposal && !preview && <button type="button" className="button secondary" onClick={() => {
            setPreview(result.proposal)
            setConfirmed(false)
          }}>Zobraziť kalibrovaný návrh cieľa</button>}
          {preview && (
            <div className="sub-panel form-stack" aria-label="Kalibrovaný návrh cieľa" role="region">
              <p>Navrhovaný cieľ <strong>{numberLabel(preview.energyTargetKcal)} kcal/deň</strong>
                {result.currentTarget === undefined ? '' : ` · aktuálny ${numberLabel(result.currentTarget)} kcal/deň`}.</p>
              <div className="actions">
                <button type="button" className="button" disabled={action.busy} onClick={() => void action.run(async () => {
                  await confirmCalibration(database, preview, today)
                  setPreview(undefined)
                  setConfirmed(true)
                })}>Potvrdiť kalibrovaný cieľ</button>
                <button type="button" className="button secondary" disabled={action.busy} onClick={() => setPreview(undefined)}>Zrušiť návrh</button>
              </div>
              <ActionError message={action.error} />
            </div>
          )}
          {confirmed && <p role="status">Kalibrovaný cieľ je uložený.</p>}
        </>
      )}
    </section>
  )
}
