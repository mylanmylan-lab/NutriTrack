import { useState } from 'react'
import { database } from '../data/database'
import { decimal } from '../data/dates'
import { saveRecipe } from '../data/journal'
import { packageFractions } from '../data/nutrition'
import type { Food, Recipe, RecipeIngredient, Serving } from '../data/model'
import { AmountFields, DecimalField, foodOptions, Form, readAmount, textValue } from './shared'

interface DraftIngredient {
  key: string
  foodId: string
  initial?: RecipeIngredient
}

function isEditableFraction({ amount }: RecipeIngredient) {
  if (amount.unit !== 'packageFraction') return false
  return packageFractions.some(({ numerator, denominator }) => numerator * amount.denominator === denominator * amount.numerator)
}

export function RecipeEditor({ recipe, foods, servings, finish }: {
  recipe?: Recipe | undefined
  foods: Food[]
  servings: Serving[]
  finish: (id?: string) => void
}) {
  const [id] = useState(() => recipe?.id ?? crypto.randomUUID())
  const [rows, setRows] = useState<DraftIngredient[]>(() => recipe?.ingredients.map((initial) => ({
    key: crypto.randomUUID(), foodId: initial.foodId, initial,
  })) ?? [{ key: crypto.randomUUID(), foodId: '' }])

  async function submit(data: FormData) {
    const name = textValue(data, 'name')
    if (!name) throw new Error('Zadajte názov receptu.')
    const weightGrams = decimal(textValue(data, 'weight'), 'Výsledná hmotnosť')
    const portions = decimal(textValue(data, 'servings'), 'Počet porcií')
    if (weightGrams === undefined && portions === undefined) throw new Error('Zadajte výslednú hmotnosť alebo počet porcií.')
    const ingredients = rows.map(({ key, foodId, initial }): RecipeIngredient => {
      const food = foods.find(({ id }) => id === foodId)
      if (!food) throw new Error('Vyberte potravinu pre každú surovinu.')
      const preparationState = food.preparationState ?? textValue(data, `${key}-state`)
      if (preparationState !== 'raw' && preparationState !== 'cooked') throw new Error('Vyberte stav suroviny.')
      return {
        foodId,
        preparationState,
        amount: initial?.amount.unit === 'packageFraction' && initial.foodId === foodId && !isEditableFraction(initial)
          ? initial.amount : readAmount(data, foodOptions(food, servings), key),
      }
    })
    const output: Recipe['yield'] = weightGrams === undefined ? { servings: portions! }
      : { weightGrams, ...(portions === undefined ? {} : { servings: portions }) }
    await saveRecipe(database, { id, name, ingredients, yield: output }, Boolean(recipe))
    finish(id)
  }

  return (
    <section className="content-panel form-stack">
      <h2>{recipe ? 'Upraviť recept' : 'Nový recept'}</h2>
      <Form onSave={submit}>
        <label className="field"><span>Názov receptu</span><input name="name" defaultValue={recipe?.name} required /></label>
        <div className="field-grid">
          <DecimalField label="Výsledná hmotnosť (g)" name="weight" defaultValue={recipe?.yield.weightGrams} />
          <DecimalField label="Počet porcií" name="servings" defaultValue={recipe?.yield.servings} />
        </div>
        {rows.map(({ key, foodId, initial }, index) => {
          const food = foods.find(({ id }) => id === foodId)
          const original = initial?.foodId === foodId ? initial : undefined
          return (
            <fieldset className="sub-panel form-stack" key={key}>
              <legend>Surovina {index + 1}</legend>
              <label className="field"><span>Potravina</span>
                <select required value={foodId} onChange={(event) => {
                  const selected = event.target.value
                  setRows(rows.map((row) => row.key === key ? { key, foodId: selected } : row))
                }}>
                  <option value="">Vyberte potravinu</option>
                  {foods.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.brand ? ` · ${entry.brand}` : ''}</option>)}
                </select>
              </label>
              {food && (
                <div key={food.id} className="form-stack">
                  {original?.amount.unit === 'packageFraction' && !isEditableFraction(original)
                    ? <p>{original.amount.numerator}/{original.amount.denominator} balenia</p>
                    : <AmountFields options={foodOptions(food, servings)} initial={original?.amount} prefix={key} />}
                  {food.preparationState
                    ? <p>{food.preparationState === 'raw' ? 'Surový stav' : 'Tepelne upravený stav'}</p>
                    : <label className="field"><span>Stav suroviny</span>
                        <select name={`${key}-state`} defaultValue={original?.preparationState ?? ''} required>
                          <option value="">Vyberte stav</option><option value="raw">Surový</option><option value="cooked">Tepelne upravený</option>
                        </select>
                      </label>}
                </div>
              )}
              <button type="button" className="button secondary" disabled={rows.length < 2} onClick={() => setRows(rows.filter((row) => row.key !== key))}>Odobrať surovinu</button>
            </fieldset>
          )
        })}
        <button type="button" className="button secondary" onClick={() => setRows([...rows, { key: crypto.randomUUID(), foodId: '' }])}>Pridať surovinu</button>
        <div className="actions">
          <button type="submit" className="button">Uložiť recept</button>
          <button type="button" className="button secondary" onClick={() => finish()}>Zrušiť</button>
        </div>
      </Form>
    </section>
  )
}
