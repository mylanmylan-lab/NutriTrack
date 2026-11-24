import { liveQuery } from 'dexie'
import { useEffect, useMemo, useRef, useState, type DependencyList, type ReactNode } from 'react'
import { numberLabel, requiredDecimal } from '../data/dates'
import { packageFractions } from '../data/nutrition'
import type { Food, MealCategory, PortionAmount, Recipe, Serving } from '../data/model'

export function useQuery<T>(read: () => Promise<T>, deps: DependencyList = []) {
  const query = useMemo(() => liveQuery(read), deps)
  const [result, setResult] = useState<{ query: typeof query; value?: T; error?: Error }>()

  useEffect(() => {
    const subscription = query.subscribe({
      next: (value) => setResult({ query, value }),
      error: (error: unknown) => setResult({ query, error: error instanceof Error ? error : new Error() }),
    })
    return () => subscription.unsubscribe()
  }, [query])

  if (result?.query !== query) return undefined
  if (result.error) throw result.error
  return result.value
}

export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const running = useRef(false)

  async function run(action: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (reason) {
      const message = reason instanceof Error && reason.name === 'Error' ? reason.message : 'Operáciu sa nepodarilo dokončiť.'
      setError(message)
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  return { busy, error, run }
}

export function Form({ onSave, children, className }: {
  onSave: (data: FormData) => Promise<void>
  children: ReactNode
  className?: string
}) {
  const action = useAction()
  return (
    <form className={className ?? 'form-stack'} onSubmit={(event) => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      void action.run(() => onSave(data))
    }}>
      <fieldset disabled={action.busy} className="form-stack">
        {children}
      </fieldset>
      <ActionError message={action.error} />
    </form>
  )
}

export function ActionError({ message }: { message: string }) {
  return message ? <p className="action-error" role="alert">{message}</p> : null
}

export function RemoveButton({ label, message, remove }: {
  label: string
  message: string
  remove: () => Promise<void>
}) {
  const action = useAction()
  return (
    <div className="form-stack">
      <button type="button" className="button secondary danger" disabled={action.busy} onClick={() => {
        if (window.confirm(message)) void action.run(remove)
      }}>{label}</button>
      <ActionError message={action.error} />
    </div>
  )
}

export function textValue(data: FormData, name: string) {
  return String(data.get(name) ?? '').trim()
}

export function DecimalField({ label, name, defaultValue, required = false }: {
  label: string
  name: string
  defaultValue?: number | undefined
  required?: boolean
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} inputMode="decimal" defaultValue={defaultValue ?? ''} required={required} />
    </label>
  )
}

export function CategoryField({ categories, defaultValue }: {
  categories: MealCategory[]
  defaultValue: string
}) {
  return (
    <label className="field">
      <span>Kategória</span>
      <select name="categoryId" defaultValue={defaultValue} required>
        {categories.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
      </select>
    </label>
  )
}

type AmountOption = { id: string; label: string; unit: 'g' | 'ml' }
  | { id: string; label: string; unit: 'piece' | 'serving'; servingId: string }
  | { id: string; label: string; unit: 'packageFraction'; numerator: number; denominator: number }

const grams: AmountOption = { id: 'g', label: 'Gramy (g)', unit: 'g' }
const millilitres: AmountOption = { id: 'ml', label: 'Mililitre (ml)', unit: 'ml' }

export function foodOptions(food: Food, servings: Serving[]): AmountOption[] {
  const basis = food.nutrition.basis.unit === 'g' ? grams : millilitres
  const options = [basis]
  if (food.density) options.push(basis === grams ? millilitres : grams)
  for (const serving of servings) {
    if (serving.foodId !== food.id) continue
    const rule = serving.conversion
    const size = rule.kind === 'mass' ? `${rule.grams} g`
      : rule.kind === 'volume' ? `${rule.millilitres} ml`
      : `${rule.numerator}/${rule.denominator} balenia`
    const units = serving.unit ? [serving.unit] : ['piece', 'serving'] as const
    for (const unit of units) options.push({
      id: `${unit}:${serving.id}`,
      label: `${unit === 'piece' ? 'Kus' : 'Porcia'} · ${serving.label} (${size})`,
      unit,
      servingId: serving.id,
    })
  }
  const size = food.package
  if (size && (size.unit === food.nutrition.basis.unit || food.density)) {
    for (const part of packageFractions) options.push({
      ...part,
      unit: 'packageFraction',
      label: `${part.label} (${numberLabel(size.value * part.numerator / part.denominator)} ${size.unit})`,
    })
  }
  return options
}

export function recipeOptions(recipe: Recipe): AmountOption[] {
  const options: AmountOption[] = []
  if (recipe.yield.servings !== undefined) options.push({ id: 'recipe', label: 'Porcie', unit: 'serving', servingId: recipe.id })
  if (recipe.yield.weightGrams !== undefined) options.push(grams)
  return options
}

export function readAmount(data: FormData, options: readonly AmountOption[], prefix = ''): PortionAmount {
  const selected = options.find(({ id }) => id === textValue(data, `${prefix}unit`))
  if (!selected) throw new Error('Vyberte jednotku množstva.')
  if (selected.unit === 'packageFraction') {
    return { unit: 'packageFraction', numerator: selected.numerator, denominator: selected.denominator }
  }
  const value = requiredDecimal(textValue(data, `${prefix}amount`), 'Množstvo')
  return 'servingId' in selected
    ? { unit: selected.unit, value, servingId: selected.servingId }
    : { unit: selected.unit, value }
}

export function AmountFields({ options, initial, prefix = '' }: {
  options: readonly AmountOption[]
  initial?: PortionAmount | undefined
  prefix?: string
}) {
  const previous = options.find((option) => {
    if (option.unit !== initial?.unit) return false
    if (option.unit === 'packageFraction' && initial.unit === 'packageFraction') {
      return initial.numerator / initial.denominator === option.numerator / option.denominator
    }
    return !('servingId' in option) || ('servingId' in initial && initial.servingId === option.servingId)
  })
  const [selected, setSelected] = useState(previous?.id ?? options[0]?.id ?? '')
  const isFraction = options.find(({ id }) => id === selected)?.unit === 'packageFraction'
  return (
    <div className="field-grid">
      {!isFraction && <DecimalField
        name={`${prefix}amount`} label="Množstvo" required
        defaultValue={previous && initial && 'value' in initial ? initial.value : options[0]?.unit === 'serving' ? 1 : undefined}
      />}
      <label className="field">
        <span>Jednotka množstva</span>
        <select name={`${prefix}unit`} value={selected} onChange={(event) => setSelected(event.target.value)} required>
          {options.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
    </div>
  )
}
