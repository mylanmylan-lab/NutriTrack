import { useEffect, useRef, useState } from 'react'
import { basicFoods } from '../data/basicFoods'
import { database } from '../data/database'
import { validGtin } from '../data/gtin'
import { findFoodByGtin, importCatalogFood, matchesFood } from '../data/journal'
import type { Food } from '../data/model'
import { openFoodFacts, type Market } from '../data/openFoodFacts'
import { BarcodeScanner } from './BarcodeScanner'
import { FoodNutrition, SourceLink } from './FoodSources'
import { ActionError, useAction } from './shared'

export type CatalogMode = 'basic' | 'off' | 'barcode'

export function CatalogSearch({ mode, select, create }: {
  mode: CatalogMode
  select: (id: string) => void
  create: (code: string) => void
}) {
  const [query, setQuery] = useState('')
  const [market, setMarket] = useState<Market>('all')
  const [results, setResults] = useState<Food[]>()
  const [product, setProduct] = useState<Food>()
  const [submittedCode, setSubmittedCode] = useState<string>()
  const action = useAction()
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])

  async function perform<T>(read: (signal: AbortSignal) => Promise<T>, apply: (value: T) => void) {
    const controller = new AbortController()
    pending.current = controller
    try {
      const result = await read(controller.signal)
      if (!controller.signal.aborted) apply(result)
    } catch (error) {
      if (!controller.signal.aborted) throw error
    } finally {
      if (pending.current === controller) pending.current = null
    }
  }

  function lookup(input: string) {
    void action.run(async () => {
      setProduct(undefined)
      setSubmittedCode(undefined)
      const code = validGtin(input)
      if (!code) throw new Error('Zadajte platný EAN alebo GTIN s kontrolnou číslicou.')
      setSubmittedCode(code)
      await perform(async (signal) => {
        const local = await findFoodByGtin(database, code)
        if (local) return { local }
        if (signal.aborted) return {}
        return { external: await openFoodFacts.product(code, signal) }
      }, ({ local, external }) => {
        if (local) select(local.id)
        else setProduct(external)
      })
    })
  }

  const visible = mode === 'basic' ? basicFoods.filter((food) => matchesFood(food, query)) : results

  return (
    <section className="content-panel form-stack">
      <h2>{mode === 'basic' ? 'Základné suroviny' : mode === 'off' ? 'Open Food Facts' : 'Čiarový kód'}</h2>
      {mode === 'barcode' ? (
        <>
          <form className="form-stack" onSubmit={(event) => { event.preventDefault(); lookup(query) }}>
            <label className="field"><span>Zadať čiarový kód</span>
              <input inputMode="numeric" value={query} onChange={(event) => { setQuery(event.target.value); setSubmittedCode(undefined); setProduct(undefined) }}
                autoComplete="off" maxLength={14} required disabled={action.busy} />
            </label>
            <button className="button" type="submit" disabled={action.busy}>Vyhľadať podľa kódu</button>
          </form>
          <BarcodeScanner disabled={action.busy} onCode={(code) => { setQuery(code); lookup(code) }} />
        </>
      ) : mode === 'off' ? (
        <>
          <p>Údaje o výrobkoch pochádzajú zo <SourceLink source={{ kind: 'openFoodFacts' }} />. Môžu sa líšiť od aktuálnej etikety.</p>
          <form className="form-stack" onSubmit={(event) => {
            event.preventDefault()
            void action.run(async () => {
              setResults(undefined)
              setProduct(undefined)
              await perform((signal) => openFoodFacts.search(query, market, signal), setResults)
            })
          }}>
            <div className="field-grid">
              <label className="field"><span>Názov alebo značka výrobku</span>
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} required maxLength={100} disabled={action.busy} />
              </label>
              <label className="field"><span>Trh</span>
                <select value={market} disabled={action.busy} onChange={(event) => setMarket(event.target.value as Market)}>
                  <option value="all">Všetky trhy</option><option value="sk">Slovensko</option><option value="cs">Česko</option>
                </select>
              </label>
            </div>
            <button className="button" type="submit" disabled={action.busy}>Hľadať v Open Food Facts</button>
          </form>
        </>
      ) : (
        <>
          <p>Offline výber z <SourceLink source={{ kind: 'usda' }} />.</p>
          <label className="field"><span>Hľadať základnú surovinu</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </>
      )}

      {action.busy && <p role="status">Načítavam…</p>}
      <ActionError message={action.error} />
      {product ? (
        <div className="sub-panel form-stack">
          <h3>{product.name}</h3>
          {product.brand && <p>{product.brand}</p>}
          <FoodNutrition key={product.id} food={product} />
          <div className="actions">
            <button type="button" className="button" disabled={action.busy} onClick={() => void action.run(async () => {
              select(await importCatalogFood(database, product))
            })}>Uložiť do katalógu</button>
            <button type="button" className="button secondary" disabled={action.busy} onClick={() => setProduct(undefined)}>Späť na výsledky</button>
          </div>
        </div>
      ) : visible && (
        <ul className="item-list">
          {!visible.length && <li>Nenašli sa zodpovedajúce potraviny.</li>}
          {visible.map((food) => (
            <li className="item-row" key={food.id}>
              <div className="item-label">
                <strong>{food.name}</strong>
                {food.brand && <p>{food.brand}</p>}
              </div>
              <button type="button" className="button secondary" disabled={action.busy} aria-label={`Zobraziť údaje ${food.name}`}
                onClick={() => {
                  if (mode === 'basic') setProduct(food)
                  else void action.run(async () => {
                    await perform((signal) => openFoodFacts.product(food.barcode!, signal), (item) => {
                      if (!item) throw new Error('Výrobok už nie je dostupný.')
                      const localized = food.name !== `Výrobok ${food.barcode}` ? { ...item, name: food.name } : item
                      setProduct(localized)
                    })
                  })
                }}>Zobraziť údaje</button>
            </li>
          ))}
        </ul>
      )}
      {mode === 'barcode' && submittedCode && !product && !action.busy && (
        <div className="form-stack">
          {!action.error && <p>Výrobok s týmto kódom sa nenašiel.</p>}
          <button className="button secondary" type="button" onClick={() => create(submittedCode)}>Vytvoriť potravinu s týmto kódom</button>
        </div>
      )}
    </section>
  )
}
