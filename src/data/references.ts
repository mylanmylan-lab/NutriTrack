import { ageAt } from './goals'
import type { Profile } from './model'

export const efsaSummary = 'https://www.efsa.europa.eu/sites/default/files/assets/DRV_Summary_tables_jan_17.pdf'
export const efsaSodium = 'https://doi.org/10.2903/j.efsa.2019.5778'
export const efsaChloride = 'https://doi.org/10.2903/j.efsa.2019.5779'
export const fibreReference = 25

export interface IntakeReference {
  value: number
  upper?: number
  unit: string
  kind: 'PRI' | 'AI' | 'Bezpečný a primeraný príjem'
  caveat?: string
}

const ai = (value: number, unit: string, caveat?: string): IntakeReference =>
  ({ value, unit, kind: 'AI', ...(caveat ? { caveat } : {}) })
const pri = (value: number, unit: string, caveat?: string): IntakeReference =>
  ({ value, unit, kind: 'PRI', ...(caveat ? { caveat } : {}) })

export function adultReferences(profile: Profile | undefined, date: string): Record<string, IntakeReference> {
  if (!profile?.formulaSex) return {}
  const age = ageAt(profile, date)
  if (age === null || age < 18) return {}
  const male = profile.formulaSex === 'male'
  return {
    fiber: ai(fibreReference, 'g'),
    vitaminA: pri(male ? 750 : 650, 'µg RE', 'Záznamy nerozlišujú retinolové ekvivalenty RE a RAE.'),
    vitaminB1: pri(0.1, 'mg/MJ', 'Referencia závisí od energetickej potreby.'),
    vitaminB2: pri(1.6, 'mg'),
    vitaminB3: pri(1.6, 'mg NE/MJ', 'Referencia používa niacínové ekvivalenty na jednotku energie.'),
    vitaminB5: ai(5, 'mg'),
    vitaminB6: pri(male ? 1.7 : 1.6, 'mg'),
    vitaminB7: ai(40, 'µg'),
    vitaminB9: pri(330, 'µg DFE', 'Záznamy nerozlišujú všetky formy potrebné na výpočet folátových ekvivalentov.'),
    vitaminB12: ai(4, 'µg'),
    vitaminC: pri(male ? 110 : 95, 'mg'),
    vitaminD: ai(15, 'µg'),
    vitaminE: ai(male ? 13 : 11, 'mg', 'Referencia platí pre alfa-tokoferol. Forma v zázname môže byť neurčená.'),
    vitaminK: ai(70, 'µg', 'Referencia sa vzťahuje na fylochinón (K1). Forma v zázname môže byť neurčená.'),
    choline: ai(400, 'mg'),
    sodium: { value: 2000, unit: 'mg', kind: 'Bezpečný a primeraný príjem', caveat: 'Populačná hodnota. Percento sa nezobrazuje.' },
    chloride: { value: 3100, unit: 'mg', kind: 'Bezpečný a primeraný príjem', caveat: 'Populačná hodnota. Percento sa nezobrazuje.' },
    calcium: pri(age < 25 ? 1000 : 950, 'mg'),
    iron: male ? pri(11, 'mg') : { ...pri(11, 'mg', 'EFSA uvádza 11 mg po menopauze a 16 mg pred menopauzou.'), upper: 16 },
    magnesium: ai(male ? 350 : 300, 'mg'),
    phosphorus: ai(550, 'mg'),
    potassium: ai(3500, 'mg'),
    zinc: { ...pri(male ? 9.4 : 7.5, 'mg', 'Referenčné rozpätie závisí od príjmu fytátov.'), upper: male ? 16.3 : 12.7 },
    copper: ai(male ? 1.6 : 1.3, 'mg'),
    manganese: ai(3, 'mg'),
    selenium: ai(70, 'µg'),
    iodine: ai(150, 'µg'),
    fluoride: ai(male ? 3.4 : 2.9, 'mg'),
    molybdenum: ai(65, 'µg'),
  }
}
