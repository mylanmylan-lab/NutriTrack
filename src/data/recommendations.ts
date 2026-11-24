import type { PeriodAnalysis } from './analysis'
import { numberLabel } from './dates'
import { fibreReference } from './references'

interface Observation {
  title: string
  evidence: string
  next: string
}

export function observations(data: PeriodAnalysis, adult: boolean): Observation[] {
  const rows: Observation[] = []
  const top = data.sources[0]
  if (data.energy.days >= 3 && top && top.kcal > 0) {
    rows.push({
      title: 'Najväčší zaznamenaný zdroj energie',
      evidence: `„${top.name}“ spolu ${numberLabel(Math.round(top.kcal))} kcal v ${top.count} zápisoch z ${data.energy.days} použiteľných dní.`,
      next: 'Ak chcete upraviť príjem, skúste pri najbližšom zápise odmerať obvyklú porciu a podľa potreby ju mierne upraviť.',
    })
  }
  if (data.goal.days >= 4 && data.goal.exceeded >= 3) {
    rows.push({
      title: 'Opakované prekročenie cieľa',
      evidence: `Príjem bol nad cieľom platným v ten deň pri ${data.goal.exceeded} z ${data.goal.days} porovnateľných dní.`,
      next: 'V denníku si vyberte jeden opakujúci sa zdroj energie a vyskúšajte malú, udržateľnú zmenu porcie alebo frekvencie.',
    })
  }
  const fibre = data.nutrients.find(({ id }) => id === 'fiber')
  if (adult && fibre?.coverage === 'covered' && fibre.fullDays >= 5 && fibre.average !== null && fibre.average < fibreReference) {
    rows.push({
      title: 'Vláknina pod referenčným príjmom',
      evidence: `Priemer ${numberLabel(fibre.average)} g/deň z ${fibre.fullDays} plne pokrytých dní. Referencia EFSA pre dospelých je ${fibreReference} g/deň.`,
      next: 'Skúste k jednému jedlu postupne pridať porciu strukovín, celozrnnej prílohy alebo zeleniny, ktorú máte radi.',
    })
  }
  const work = data.weekday
  const weekend = data.weekend
  if (work.days >= 3 && weekend.days >= 2 && work.average !== null && weekend.average !== null
    && Math.abs(work.average - weekend.average) >= 100) {
    const higher = weekend.average > work.average ? 'cez víkend' : 'v pracovné dni'
    rows.push({
      title: 'Rozdiel medzi pracovnými dňami a víkendom',
      evidence: `Zaznamenaný priemer bol ${higher} vyšší o ${numberLabel(Math.round(Math.abs(work.average - weekend.average)))} kcal/deň (${work.days} pracovných a ${weekend.days} víkendové dni v porovnaní).`,
      next: 'Pozrite si kategórie a časy zápisov v dňoch s vyšším príjmom a vyberte jednu situáciu, ktorú chcete sledovať.',
    })
  }
  const evening = data.habits.find(({ key }) => key === 'evening')
  if (evening && evening.days >= 3 && evening.otherDays >= 3 && evening.withAverage !== null && evening.otherAverage !== null
    && evening.withAverage - evening.otherAverage >= 100) {
    rows.push({
      title: 'Vyšší príjem v dňoch s večerným občerstvením',
      evidence: `V ${evening.days} dňoch s večerným zápisom bol denný priemer vyšší o ${numberLabel(Math.round(evening.withAverage - evening.otherAverage))} kcal oproti ${evening.otherDays} ostatným dňom.`,
      next: 'Ak vás tento vzorec zaujíma, skúste pri večernom občerstvení zaznamenať dôvod a veľkosť porcie.',
    })
  }
  return rows
}
