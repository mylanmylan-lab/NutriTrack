import { useState } from 'react'
import { database } from '../data/database'
import { decimal, requiredDecimal } from '../data/dates'
import { saveFood } from '../data/journal'
import { validGtin } from '../data/gtin'
import type { Food, NutrientUnit, Serving } from '../data/model'
import { acceptedUnits, localSource, normalizeNutrient, nutrientDefinitions } from '../data/nutrition'
import { DecimalField, Form, textValue } from './shared'

export function FoodEditor({ food, barcode, servings, finish }: {
  food?: Food | undefined
  barcode?: string | undefined
  servings: Serving[]
  finish: (id?: string) => void
}) {
  const [id] = useState(() => food?.id ?? crypto.randomUUID())
  const [rules, setRules] = useState<{ id: string; serving?: Serving }[]>(() => servings.map((serving) => ({ id: serving.id, serving })))
  const existing = new Map(food?.nutrition.nutrients.map((nutrient) => [nutrient.id, nutrient]))

  async function submit(data: FormData) {
    const name = textValue(data, 'name')
    if (!name) throw new Error('Zadajte názov potraviny.')
    const brand = textValue(data, 'brand')
    const code = textValue(data, 'barcode')
    if (code && code !== food?.barcode && !validGtin(code)) throw new Error('Zadajte platný EAN alebo GTIN s kontrolnou číslicou.')
    const packageValue = decimal(textValue(data, 'package'), 'Veľkosť balenia')
    const packageUnit = textValue(data, 'packageUnit') === 'ml' ? 'ml' : 'g'
    const basis = requiredDecimal(textValue(data, 'basis'), 'Referenčné množstvo')
    const basisUnit = textValue(data, 'basisUnit') === 'ml' ? 'ml' : 'g'
    const density = decimal(textValue(data, 'density'), 'Hustota')
    const state = textValue(data, 'state')
    const nutrientRows = nutrientDefinitions.flatMap(([key, label, defaultUnit], index) => {
      const old = existing.get(key)
      const value = decimal(textValue(data, key), label, true)
      if (value === undefined && index >= 9 && !old) return []
      const unit = textValue(data, `${key}-unit`) as NutrientUnit || defaultUnit
      if (!acceptedUnits(defaultUnit, key).includes(unit) && old?.unit !== unit) throw new Error('Neplatná jednotka živiny.')
      const isSame = old && value === (old.value ?? undefined) && unit === old.unit
      return [normalizeNutrient(isSame ? old : { id: key, value: value ?? null, unit, source: localSource })]
    })
    const preserved = food?.nutrition.nutrients.filter(({ id }) => !nutrientDefinitions.some(([key]) => id === key)) ?? []

    const servingRows = rules.map(({ id: servingId, serving }): Serving => {
      if (serving?.conversion.kind === 'packageFraction') return serving
      const prefix = `rule-${servingId}`
      const label = textValue(data, `${prefix}-label`)
      if (!label) throw new Error('Pomenujte každú pridanú porciu alebo kus.')
      const value = requiredDecimal(textValue(data, `${prefix}-value`), 'Veľkosť kusu alebo porcie')
      const conversion = textValue(data, `${prefix}-unit`) === 'ml'
        ? { kind: 'volume' as const, millilitres: value }
        : { kind: 'mass' as const, grams: value }
      const kind = textValue(data, `${prefix}-type`)
      return {
        id: servingId,
        foodId: id,
        label,
        ...(kind === 'piece' || kind === 'serving' ? { unit: kind } : {}),
        conversion,
        estimated: data.has(`${prefix}-estimated`),
      }
    })

    await saveFood(database, {
      id,
      name,
      source: food?.source ?? localSource,
      nutrition: { basis: { value: basis, unit: basisUnit }, nutrients: [...nutrientRows, ...preserved] },
      ...(brand ? { brand } : {}),
      ...(density === undefined ? {} : { density: { gramsPerMillilitre: density, estimated: data.has('densityEstimated') } }),
      ...(state === 'raw' || state === 'cooked' ? { preparationState: state } : {}),
      ...(code ? { barcode: code } : {}),
      ...(packageValue === undefined ? {} : { package: { value: packageValue, unit: packageUnit } }),
    }, servingRows, Boolean(food))
    finish(id)
  }

  function nutrientField([key, label, unit]: readonly [string, string, NutrientUnit]) {
    const old = existing.get(key)
    const units = new Set([...(old ? [old.unit] : []), ...acceptedUnits(unit, key)])
    return (
      <div className="nutrient-field" key={key}>
        <DecimalField label={label} name={key} defaultValue={old?.value ?? undefined} />
        <label className="field">
          <span>Jednotka <span className="visually-hidden">{label}</span></span>
          <select name={`${key}-unit`} defaultValue={old?.unit ?? unit}>
            {[...units].map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
      </div>
    )
  }

  return (
    <section className="content-panel form-stack">
      <h2>{food ? 'Upraviť potravinu' : 'Nová potravina'}</h2>
      <Form onSave={submit}>
        <div className="field-grid">
          <label className="field"><span>Názov potraviny</span><input name="name" defaultValue={food?.name} required /></label>
          <label className="field"><span>Značka</span><input name="brand" defaultValue={food?.brand} /></label>
          <label className="field"><span>EAN alebo GTIN</span><input name="barcode" inputMode="numeric"
            autoComplete="off" maxLength={14} defaultValue={food?.barcode ?? barcode} /></label>
          <DecimalField label="Referenčné množstvo" name="basis" defaultValue={food?.nutrition.basis.value ?? 100} required />
          <label className="field"><span>Jednotka referencie</span>
            <select name="basisUnit" defaultValue={food?.nutrition.basis.unit ?? 'g'}><option>g</option><option>ml</option></select>
          </label>
          <DecimalField label="Veľkosť balenia" name="package" defaultValue={food?.package?.value} />
          <label className="field"><span>Jednotka balenia</span>
            <select name="packageUnit" defaultValue={food?.package?.unit ?? food?.nutrition.basis.unit ?? 'g'}><option>g</option><option>ml</option></select>
          </label>
          <DecimalField label="Hustota (g/ml)" name="density" defaultValue={food?.density?.gramsPerMillilitre} />
          <label className="field"><span>Stav potraviny</span>
            <select name="state" defaultValue={food?.preparationState ?? ''}>
              <option value="">Neuvedený</option><option value="raw">Surový</option><option value="cooked">Tepelne upravený</option>
            </select>
          </label>
        </div>
        <label className="check"><input type="checkbox" name="densityEstimated" defaultChecked={food?.density?.estimated} /> Hustota je odhad</label>
        <section className="form-stack">
          <h3>Živiny v referenčnom množstve</h3>
          <p>Prázdne pole znamená, že údaj nie je dostupný.</p>
          <div className="field-grid">{nutrientDefinitions.slice(0, 9).map(nutrientField)}</div>
          <details>
            <summary>Ďalšie živiny, vitamíny a minerály</summary>
            <div className="field-grid">{nutrientDefinitions.slice(9).map(nutrientField)}</div>
          </details>
        </section>
        <section className="form-stack">
          <h3>Kusy a porcie</h3>
          {rules.map(({ id: servingId, serving }) => {
            const prefix = `rule-${servingId}`
            const conversion = serving?.conversion
            if (conversion?.kind === 'packageFraction') {
              return <p key={servingId}>{serving?.label} · {conversion.numerator}/{conversion.denominator} balenia</p>
            }
            return (
              <fieldset key={servingId} className="sub-panel form-stack">
                <legend>{serving?.label ?? 'Veľkosť kusu alebo porcie'}</legend>
                <div className="field-grid">
                  <label className="field"><span>Názov veľkosti</span><input name={`${prefix}-label`} defaultValue={serving?.label} required /></label>
                  <label className="field"><span>Typ veľkosti</span>
                    <select name={`${prefix}-type`} defaultValue={serving ? serving.unit ?? '' : 'serving'}>
                      {serving && !serving.unit && <option value="">Kus aj porcia</option>}
                      <option value="piece">Kus</option><option value="serving">Porcia</option>
                    </select>
                  </label>
                  <DecimalField label="Veľkosť" name={`${prefix}-value`} defaultValue={conversion?.kind === 'mass' ? conversion.grams : conversion?.millilitres} required />
                  <label className="field"><span>Jednotka veľkosti</span>
                    <select name={`${prefix}-unit`} defaultValue={conversion?.kind === 'volume' ? 'ml' : 'g'}><option>g</option><option>ml</option></select>
                  </label>
                </div>
                <label className="check"><input name={`${prefix}-estimated`} type="checkbox" defaultChecked={serving?.estimated} /> Veľkosť je odhad</label>
                <button type="button" className="button secondary" onClick={() => setRules(rules.filter((rule) => rule.id !== servingId))}>Odobrať veľkosť</button>
              </fieldset>
            )
          })}
          <button type="button" className="button secondary" onClick={() => setRules([...rules, { id: crypto.randomUUID() }])}>Pridať kus alebo porciu</button>
        </section>
        <div className="actions">
          <button className="button" type="submit">Uložiť potravinu</button>
          <button className="button secondary" type="button" onClick={() => finish()}>Zrušiť</button>
        </div>
      </Form>
    </section>
  )
}
