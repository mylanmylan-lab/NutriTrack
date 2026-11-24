import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { database } from '../data/database'
import { isLocalDate, localDate, localTime } from '../data/dates'
import {
  deleteFood, deleteRecipe, importCatalogFood, logCombination, logMeal, matchesFood,
  readCatalog, readCategories, searchTerm, toggleFavorite,
} from '../data/journal'
import { readMealLabels } from '../data/mealLabels'
import { MealLabelFields } from './MealLabels'
import type { Food, MealEntry } from '../data/model'
import { openFoodFacts } from '../data/openFoodFacts'
import { CatalogSearch, type CatalogMode } from './CatalogSearch'
import { FoodNutrition, SourceLink } from './FoodSources'
import { FoodEditor } from './FoodEditor'
import { RecipeEditor } from './RecipeEditor'
import { ActionError, AmountFields, CategoryField, foodOptions, Form, readAmount, recipeOptions, RemoveButton, textValue, useAction, useQuery } from './shared'

type Item = MealEntry['item']

export function AddMeal() {
  const [query] = useSearchParams()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Item>()
  const [editor, setEditor] = useState<{ type: Item['type']; id?: string; barcode?: string }>()
  const [mode, setMode] = useState<CatalogMode>()
  const [selectedCombination, setCombination] = useState<string>()
  const catalog = useQuery(() => readCatalog(database))
  const categories = useQuery(() => readCategories(database))
  const requestedDate = query.get('datum') ?? ''
  const date = isLocalDate(requestedDate) ? requestedDate : localDate()
  if (!catalog || !categories) return <p role="status">Načítavam miestny katalóg…</p>

  const { foods, servings, recipes, lastServings, combinations } = catalog
  const combination = combinations.find(({ id }) => id === selectedCombination)
  const food = foods.find(({ id }) => id === selected?.id && selected?.type === 'food')
  const recipe = recipes.find(({ id }) => id === selected?.id && selected?.type === 'recipe')

  if (editor) {
    const originalFood = editor.type === 'food' ? foods.find(({ id }) => id === editor.id) : undefined
    const originalRecipe = editor.type === 'recipe' ? recipes.find(({ id }) => id === editor.id) : undefined
    if (editor.id && !originalFood && !originalRecipe) {
      return <div className="content-panel form-stack">
        <p role="status">Položka už nie je dostupná.</p>
        <button type="button" className="button secondary" onClick={() => setEditor(undefined)}>Späť na výber</button>
      </div>
    }
    const finish = (id?: string) => {
      setEditor(undefined)
      if (id) setSelected({ type: editor.type, id })
    }
    return editor.type === 'food'
      ? <FoodEditor key={editor.id ?? 'new-food'} food={originalFood} barcode={editor.barcode}
          servings={servings.filter(({ foodId }) => foodId === editor.id)} finish={finish} />
      : <RecipeEditor key={editor.id ?? 'new-recipe'} recipe={originalRecipe}
          foods={foods} servings={servings} finish={finish} />
  }

  if (combination) {
    return (
      <section className="content-panel form-stack">
        <button className="button secondary" type="button" onClick={() => setCombination(undefined)}>Späť na výber</button>
        <h2>{combination.name}</h2>
        <ul className="item-list">
          {combination.items.map(({ item }, index) => (
            <li key={index}>{(item.type === 'food' ? foods : recipes).find(({ id }) => id === item.id)?.name ?? 'Nedostupná položka'}</li>
          ))}
        </ul>
        <Form onSave={async (data) => {
          const entryDate = textValue(data, 'date')
          await logCombination(database, combination.id, {
            date: entryDate, time: textValue(data, 'time'), categoryId: textValue(data, 'categoryId'),
          })
          void navigate(`/dennik?datum=${entryDate}`)
        }}>
          <CategoryField categories={categories} defaultValue={combination.categoryId} />
          <MealDateFields date={date} />
          <button className="button" type="submit">Zapísať kombináciu do denníka</button>
        </Form>
      </section>
    )
  }

  if (selected && (food || recipe)) {
    const options = food ? foodOptions(food, servings) : recipeOptions(recipe!)
    const last = food ? lastServings.find(({ foodId }) => foodId === food.id) : undefined
    const lastCategory = categories.find(({ id }) => id === last?.categoryId)?.id
    return (
      <section className="content-panel form-stack">
        <button className="button secondary" type="button" onClick={() => setSelected(undefined)}>Späť na výber</button>
        <h2>{food?.name ?? recipe?.name}</h2>
        {food?.brand && <p>{food.brand}</p>}
        {food && <FoodNutrition key={food.id} food={food} />}
        {food?.source.kind === 'openFoodFacts' && <UpdateProduct food={food} />}
        {food?.preparationState && <p>{food.preparationState === 'raw' ? 'Surový stav' : 'Tepelne upravený stav'}</p>}
        <Form key={`${selected.type}:${selected.id}`} onSave={async (data) => {
          const entryDate = textValue(data, 'date')
          await logMeal(database, {
            date: entryDate, time: textValue(data, 'time'), categoryId: textValue(data, 'categoryId'),
            item: selected, amount: readAmount(data, options), ...readMealLabels(data),
          })
          void navigate(`/dennik?datum=${entryDate}`)
        }}>
          <AmountFields key={options.map(({ id }) => id).join(',')} options={options} initial={last?.amount} />
          <CategoryField categories={categories} defaultValue={lastCategory ?? categories[0]?.id ?? ''} />
          <MealDateFields date={date} />
          <MealLabelFields />
          {food && !food.density && <p>Pre prevod medzi gramami a mililitrami doplňte v potravine hustotu.</p>}
          <button className="button" type="submit">Zapísať do denníka</button>
        </Form>
      </section>
    )
  }

  const favoriteFoods = foods.filter(({ favorite }) => favorite)
  const recentFoods = [...lastServings].sort((a, b) => b.usedAt.localeCompare(a.usedAt))
    .slice(0, 8).flatMap(({ foodId }) => foods.find(({ id }) => id === foodId) ?? [])
  const chooseFood = (id: string) => setSelected({ type: 'food', id })
  const filteredFoods = foods.filter((entry) => matchesFood(entry, search))
  const filteredRecipes = recipes.filter(({ name }) => searchTerm(name).includes(searchTerm(search)))
  return (
    <>
      <section className="content-panel form-stack">
        <div className="actions">
          <button className="button" type="button" onClick={() => setEditor({ type: 'food' })}>Nová potravina</button>
          <button className="button secondary" type="button" disabled={!foods.length} onClick={() => setEditor({ type: 'recipe' })}>Nový recept</button>
        </div>
        <div className="actions" aria-label="Zdroje vyhľadávania">
          {([
            ['barcode', 'Čiarový kód'], ['off', 'Open Food Facts'], ['basic', 'Základné suroviny'],
          ] as const).map(([key, label]) => (
            <button type="button" key={key} className="button secondary" aria-pressed={mode === key}
              onClick={() => setMode(mode === key ? undefined : key)}>{label}</button>
          ))}
        </div>
        <label className="field">
          <span>Hľadať v miestnom katalógu</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Názov, značka alebo EAN" />
        </label>
      </section>
      {mode && <CatalogSearch key={mode} mode={mode}
        select={(id) => { setMode(undefined); chooseFood(id) }}
        create={(barcode) => { setMode(undefined); setEditor({ type: 'food', barcode }) }} />}
      {!search.trim() && !mode && (
        <>
          <QuickFoods title="Obľúbené potraviny" foods={favoriteFoods} choose={chooseFood} />
          <QuickFoods title="Nedávno použité" foods={recentFoods} choose={chooseFood} />
          {combinations.length > 0 && (
            <section className="content-panel form-stack">
              <h2>Kombinácie jedál</h2>
              <ul className="item-list">
                {combinations.map((entry) => (
                  <li key={entry.id} className="item-row">
                    <strong className="item-label">{entry.name}</strong>
                    <div className="actions">
                      <button type="button" className="button" onClick={() => setCombination(entry.id)}>Pridať kombináciu</button>
                      <RemoveButton label={`Zmazať kombináciu ${entry.name}`} message={`Zmazať kombináciu „${entry.name}“?`}
                        remove={() => database.mealCombinations.delete(entry.id)} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <section className="content-panel form-stack">
        <h2>Potraviny</h2>
        {!filteredFoods.length && <p>{search.trim() ? 'Žiadna zodpovedajúca potravina.' : 'Pridajte prvú vlastnú potravinu.'}</p>}
        <ul className="item-list">
          {filteredFoods.map((entry) => (
            <li key={entry.id} className="item-row">
              <div className="item-label">
                <strong>{entry.name}</strong>
                {entry.brand && <p>{entry.brand}</p>}
                <p><SourceLink source={entry.source} /></p>
              </div>
              <div className="actions">
                <button className="button" type="button" aria-label={`Vybrať potravinu ${entry.name}`} onClick={() => chooseFood(entry.id)}>Vybrať</button>
                <FavoriteButton food={entry} />
                <button className="button secondary" type="button" aria-label={`Upraviť potravinu ${entry.name}`} onClick={() => setEditor({ type: 'food', id: entry.id })}>Upraviť</button>
                <RemoveButton label={`Zmazať potravinu ${entry.name}`} message={`Zmazať potravinu „${entry.name}“ z katalógu?`}
                  remove={() => deleteFood(database, entry.id)} />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="content-panel form-stack">
        <h2>Recepty</h2>
        {!filteredRecipes.length && <p>{search.trim() ? 'Žiadny zodpovedajúci recept.' : 'Zatiaľ tu nie sú recepty.'}</p>}
        <ul className="item-list">
          {filteredRecipes.map((entry) => (
            <li key={entry.id} className="item-row">
              <div className="item-label"><strong>{entry.name}</strong></div>
              <div className="actions">
                <button className="button" type="button" aria-label={`Vybrať recept ${entry.name}`} onClick={() => setSelected({ type: 'recipe', id: entry.id })}>Vybrať</button>
                <button className="button secondary" type="button" aria-label={`Upraviť recept ${entry.name}`} onClick={() => setEditor({ type: 'recipe', id: entry.id })}>Upraviť</button>
                <RemoveButton label={`Zmazať recept ${entry.name}`} message={`Zmazať recept „${entry.name}“ z katalógu?`}
                  remove={() => deleteRecipe(database, entry.id)} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function MealDateFields({ date }: { date: string }) {
  return (
    <div className="field-grid">
      <label className="field"><span>Dátum</span><input name="date" type="date" defaultValue={date} required /></label>
      <label className="field"><span>Čas</span><input name="time" type="time" defaultValue={localTime()} required /></label>
    </div>
  )
}

function FavoriteButton({ food }: { food: Food }) {
  const action = useAction()
  return (
    <div className="form-stack">
      <button className="button secondary" type="button" aria-pressed={Boolean(food.favorite)}
        aria-label={`Obľúbená potravina ${food.name}`} disabled={action.busy}
        onClick={() => void action.run(() => toggleFavorite(database, food.id))}>
        {food.favorite ? '★ Obľúbená' : '☆ Obľúbiť'}
      </button>
      <ActionError message={action.error} />
    </div>
  )
}

function QuickFoods({ title, foods, choose }: { title: string; foods: Food[]; choose: (id: string) => void }) {
  if (!foods.length) return null
  return (
    <section aria-label={title} className="content-panel form-stack">
      <h2>{title}</h2>
      <div className="actions">
        {foods.map((food) => (
          <button type="button" className="button secondary" key={food.id} onClick={() => choose(food.id)}>{food.name}</button>
        ))}
      </div>
    </section>
  )
}

function UpdateProduct({ food }: { food: Food }) {
  const action = useAction()
  const [updated, setUpdated] = useState(false)
  const code = food.source.externalId ?? food.barcode
  if (!code) return null
  return (
    <div className="form-stack">
      <button className="button secondary" type="button" disabled={action.busy} onClick={() => void action.run(async () => {
        setUpdated(false)
        const incoming = await openFoodFacts.product(code, undefined, true)
        if (!incoming) throw new Error('Výrobok už nie je dostupný v Open Food Facts.')
        await importCatalogFood(database, incoming, food.id)
        setUpdated(true)
      })}>Aktualizovať z Open Food Facts</button>
      {updated && <p role="status">Údaje v katalógu sú aktualizované.</p>}
      <ActionError message={action.error} />
    </div>
  )
}
