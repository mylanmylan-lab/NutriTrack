import { contextLabels, patternLabels, type MealLabels } from '../data/mealLabels'
import type { MealPattern, SnackContext } from '../data/model'

export function MealLabelFields({ labels }: { labels?: MealLabels }) {
  return (
    <details>
      <summary>Kontext jedla a označenia</summary>
      <fieldset className="form-stack">
        <legend>Dôvod konzumácie (voliteľné)</legend>
        {Object.entries(contextLabels).map(([key, label]) => (
          <label className="check" key={key}>
            <input type="checkbox" name="context" value={key} defaultChecked={labels?.context?.includes(key as SnackContext)} />{label}
          </label>
        ))}
      </fieldset>
      <fieldset className="form-stack">
        <legend>Typ jedla alebo nápoja (voliteľné)</legend>
        {Object.entries(patternLabels).map(([key, label]) => (
          <label className="check" key={key}>
            <input type="checkbox" name="patternTags" value={key} defaultChecked={labels?.patternTags?.includes(key as MealPattern)} />{label}
          </label>
        ))}
      </fieldset>
    </details>
  )
}

export function MealLabelSummary({ labels }: { labels: MealLabels }) {
  const tags = [...(labels.context ?? []).map((key) => contextLabels[key]), ...(labels.patternTags ?? []).map((key) => patternLabels[key])]
  return tags.length ? <p>{tags.join(' · ')}</p> : null
}
