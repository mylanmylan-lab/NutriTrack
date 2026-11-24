import { useState } from 'react'
import { dateLabel, localDate, numberLabel } from '../data/dates'
import type { Food, FoodSource } from '../data/model'
import { nutrientLabel, snapshotFood } from '../data/nutrition'

export function sourceLabel(source: FoodSource) {
  return source.kind === 'openFoodFacts' ? 'Open Food Facts' : source.kind === 'usda' ? 'USDA FoodData Central' : 'Vlastný údaj'
}

export function SourceLink({ source }: { source: FoodSource }) {
  const label = sourceLabel(source)
  if (source.kind === 'local') return <span>{label}</span>
  const id = source.externalId ? encodeURIComponent(source.externalId) : undefined
  const url = source.kind === 'usda'
    ? id ? `https://fdc.nal.usda.gov/food-details/${id}/nutrients` : 'https://fdc.nal.usda.gov/'
    : id ? `https://world.openfoodfacts.org/product/${id}` : 'https://world.openfoodfacts.org/'
  return <a className="text-link" href={url} target="_blank" rel="noreferrer">{label}</a>
}

export function FoodNutrition({ food }: { food: Food }) {
  const [open, setOpen] = useState(false)
  const { basis } = food.nutrition
  const { nutrients } = snapshotFood(food, { unit: basis.unit, value: basis.value }, [])
  const available = nutrients.filter(({ value }) => value !== null).length
  return (
    <div className="form-stack">
      <p><SourceLink source={food.source} />
        {food.source.kind === 'usda' && food.source.version ? ` · ${food.source.version}` : ''}
        {food.source.retrievedAt ? ` · načítané ${dateLabel(localDate(new Date(food.source.retrievedAt)))}` : ''}
      </p>
      {(food.barcode || food.package) && (
        <p>{food.barcode && `EAN/GTIN ${food.barcode}`}
          {food.barcode && food.package && ' · '}
          {food.package && `Balenie ${numberLabel(food.package.value)} ${food.package.unit}`}
        </p>
      )}
      <details onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>Výživové údaje na {numberLabel(basis.value)} {basis.unit}</summary>
        <p>{available} z {nutrients.length} evidovaných živín má hodnotu.</p>
        {open && <dl className="nutrient-list">
          {nutrients.map(({ id, unit, value, source }, index) => (
            <div key={`${id}/${unit}/${index}`}>
              <dt>{nutrientLabel(id)}</dt>
              <dd>{value === null ? 'Údaj nie je dostupný' : `${numberLabel(value)} ${unit}`}
                {source.kind !== food.source.kind && value !== null && <small>{sourceLabel(source)}</small>}
              </dd>
            </div>
          ))}
        </dl>}
      </details>
    </div>
  )
}

export function CatalogAttribution() {
  return (
    <div className="form-stack">
      <p><a className="text-link" href="https://world.openfoodfacts.org/" target="_blank" rel="noreferrer">Open Food Facts</a>
        {' · '}
        <a className="text-link" href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL 1.0</a>
        {' · '}
        <a className="text-link" href="https://opendatacommons.org/licenses/dbcl/1-0/" target="_blank" rel="noreferrer">DbCL 1.0</a>
      </p>
      <p><a className="text-link" href="https://fdc.nal.usda.gov/download-datasets/" target="_blank" rel="noreferrer">USDA FoodData Central</a>
        {' · Foundation Foods · '}
        <a className="text-link" href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer">CC0 1.0</a>
      </p>
    </div>
  )
}
