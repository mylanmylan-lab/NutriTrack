import { equivalentGtin, offBarcode, validGtin } from './gtin'
import type { Food, FoodSource, Nutrient, NutrientUnit, NutritionAmountUnit } from './model'
import { acceptedUnits, normalizeNutrient, nutrientDefinitions } from './nutrition'

const host = 'https://world.openfoodfacts.org'
const fields = [
  'code', 'product_name', 'product_name_sk', 'product_name_cs', 'brands', 'countries_tags',
  'product_quantity', 'product_quantity_unit', 'quantity', 'last_modified_t',
  'nutrition', 'nutriments', 'nutrition_data_per', 'serving_quantity_unit',
].join(',')

const aliases: Record<string, string[]> = {
  energy: ['energy-kcal', 'energy-kj', 'energy'],
  protein: ['proteins'],
  fiber: ['fiber'],
  saturatedFat: ['saturated-fat'],
  addedSugars: ['added-sugars'],
  transFat: ['trans-fat'],
  monounsaturatedFat: ['monounsaturated-fat'],
  polyunsaturatedFat: ['polyunsaturated-fat'],
  vitaminB3: ['vitamin-pp', 'vitamin-b3'],
  vitaminB5: ['pantothenic-acid', 'vitamin-b5'],
  vitaminB7: ['biotin', 'vitamin-b7'],
  vitaminB9: ['vitamin-b9', 'folates', 'folic-acid'],
  vitaminK: ['vitamin-k', 'phylloquinone'],
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function numeric(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : undefined
  if (typeof value === 'string' && /^\d+(?:[.,]\d+)?$/.test(value.trim())) return numeric(Number(value.replace(',', '.')))
  return undefined
}

function nutrientUnit(value: unknown): NutrientUnit | undefined {
  const unit = text(value).toLowerCase()
  if (unit === 'ug' || unit === 'μg' || unit === 'µg' || unit === 'mcg') return 'µg'
  if (unit === 'kj') return 'kJ'
  if (unit === 'iu' || unit === 'ui') return 'IU'
  if (unit === 'kcal' || unit === 'g' || unit === 'mg') return unit
  return undefined
}

function packageSize(product: Record<string, unknown>): Food['package'] {
  const match = /^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|dl|l)\s*(?:e|℮)?$/i.exec(text(product.quantity))
  const factors = { kg: [1000, 'g'], g: [1, 'g'], l: [1000, 'ml'], dl: [100, 'ml'], cl: [10, 'ml'], ml: [1, 'ml'] } as const
  function convert(value: unknown, unit: string) {
    const amount = numeric(value)
    if (amount === undefined || amount <= 0 || !Object.hasOwn(factors, unit)) return undefined
    const [factor, resultUnit] = factors[unit as keyof typeof factors]
    return Number.isFinite(amount * factor) ? { value: amount * factor, unit: resultUnit } : undefined
  }
  return convert(product.product_quantity, text(product.product_quantity_unit).toLowerCase())
    ?? (match ? convert(match[1], match[2]!.toLowerCase()) : undefined)
}

function reference(value: unknown): NutritionAmountUnit | undefined {
  if (value === '100ml') return 'ml'
  if (value === '100g') return 'g'
  return undefined
}

function nutritionSet(product: Record<string, unknown>) {
  const nutrition = object(product.nutrition)
  const aggregated = object(nutrition?.aggregated_set)
  const sold = aggregated?.preparation === 'as_sold' && reference(aggregated.per)
    ? aggregated : undefined
  const inputs = Array.isArray(nutrition?.input_sets)
    ? nutrition.input_sets.flatMap((item: unknown) => {
      const input = object(item)
      return input?.preparation === 'as_sold' && input.source !== 'estimate' && reference(input.per) ? [input] : []
    }) : []
  const typed = sold ?? inputs[0]
  if (typed) {
    const unit = reference(typed.per)!
    const sets = [typed, ...inputs.filter((input) => input.per === typed.per && input !== typed)]
    return {
      unit,
      read(key: string) {
        for (const set of sets) {
          const entry = object(object(set.nutrients)?.[key])
          const value = numeric(entry?.value)
          const unit = nutrientUnit(entry?.unit)
          if (value !== undefined && unit && entry?.source !== 'estimate' && set.source !== 'estimate'
            && !['<', '>', '<=', '>=', '≤', '≥'].includes(text(entry?.modifier))) return { value, unit }
        }
        return undefined
      },
    }
  }

  // Product Opener CGI uses the documented legacy normalized _100g fields.
  const legacy = nutrition ? undefined : object(product.nutriments)
  const unit = reference(product.nutrition_data_per)
    ?? (product.nutrition_data_per === 'serving' && product.serving_quantity_unit === 'ml' ? 'ml' : 'g')
  return {
    unit,
    read(key: string) {
      const modifier = text(legacy?.[`${key}_modifier`])
      if (['<', '>', '<=', '>=', '≤', '≥'].includes(modifier)) return undefined
      const value = numeric(legacy?.[`${key}_100g`])
      if (value === undefined) return undefined
      const unit: NutrientUnit = key === 'energy-kcal' ? 'kcal' : key === 'energy' || key === 'energy-kj' ? 'kJ' : 'g'
      return { value, unit }
    },
  }
}

export type Market = 'all' | 'sk' | 'cs'

export function fromOpenFoodFacts(raw: unknown, market: Market = 'all', retrievedAt = new Date().toISOString()): Food | undefined {
  const product = object(raw)
  if (!product) return undefined
  const code = validGtin(text(product.code))
  if (!code) return undefined
  const source: FoodSource = {
    kind: 'openFoodFacts', externalId: code, retrievedAt,
    ...(numeric(product.last_modified_t) === undefined ? {} : { version: String(product.last_modified_t) }),
  }
  const set = nutritionSet(product)
  const nutrients = nutrientDefinitions.map(([id, , unit]): Nutrient => {
    const keys = aliases[id] ?? [id.replace(/^vitamin([A-Z])/, (_, letter: string) => `vitamin-${letter.toLowerCase()}`)]
    for (const key of keys) {
      const found = set.read(key)
      if (found && acceptedUnits(unit, id).includes(found.unit)) {
        const normalized = normalizeNutrient({ id, ...found, source })
        if (Number.isFinite(normalized.value)) return normalized
      }
    }
    return { id, unit, value: null, source }
  })
  const name = (market === 'cs' ? text(product.product_name_cs) || text(product.product_name_sk)
    : text(product.product_name_sk) || text(product.product_name_cs)) || text(product.product_name) || `Výrobok ${code}`
  const brand = text(product.brands)
  const size = packageSize(product)
  return {
    id: `off:${code.padStart(14, '0')}`, name, barcode: code, source,
    nutrition: { basis: { value: 100, unit: set.unit }, nutrients },
    ...(brand ? { brand } : {}),
    ...(size ? { package: size } : {}),
  }
}

type RequestKind = 'search' | 'product'

export function openFoodFactsClient(
  fetcher: typeof fetch = (...args) => fetch(...args),
  now: () => number = Date.now,
  timeoutMs = 8000,
) {
  const quota = { search: 8, product: 12 }
  const requests: Record<RequestKind, number[]> = { search: [], product: [] }
  const coolingUntil: Record<RequestKind, number> = { search: 0, product: 0 }
  const cache = new Map<string, { expires: number; value: unknown }>()

  async function request(url: string, kind: RequestKind, signal?: AbortSignal, fresh = false): Promise<unknown> {
    if (signal?.aborted) throw signal.reason
    const stamp = now()
    const stored = cache.get(url)
    if (!fresh && stored && stamp < stored.expires) return stored.value
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Open Food Facts je dostupné cez internet. Použite miestny katalóg alebo manuálny zápis.')
    requests[kind] = requests[kind].filter((time) => stamp - time < 60_000)
    if (stamp < coolingUntil[kind] || requests[kind].length >= quota[kind]) {
      throw new Error('Limit Open Food Facts bol dosiahnutý. Skúste to o chvíľu.')
    }
    requests[kind].push(stamp)
    const controller = new AbortController()
    const cancel = () => controller.abort()
    signal?.addEventListener('abort', cancel, { once: true })
    const timer = setTimeout(cancel, timeoutMs)
    try {
      const identity = (import.meta.env.VITE_OFF_CONTACT as string | undefined)?.trim()
        || (typeof location !== 'undefined' ? location.origin : 'personal PWA')
      const agent = `NutriTrack/0.1.0 (${identity})`
      const response = await fetcher(url, {
        signal: controller.signal, credentials: 'omit',
        headers: { 'User-Agent': agent, 'X-User-Agent': agent },
      })
      if (response.status === 429 || response.status === 503) {
        const retry = response.headers.get('Retry-After')
        const seconds = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : undefined
        const date = retry ? Date.parse(retry) : NaN
        coolingUntil[kind] = now() + (seconds ?? (Number.isFinite(date) ? Math.max(0, date - now()) : 60_000))
      }
      const value: unknown = response.status === 404 && kind === 'product' ? null
        : response.ok ? await response.json() : undefined
      if (value === undefined) {
        if (response.status === 429) throw new Error('Open Food Facts obmedzilo počet požiadaviek. Skúste to o chvíľu.')
        throw new Error('Open Food Facts je dočasne nedostupné. Použite miestny katalóg alebo manuálny zápis.')
      }
      if (cache.size >= 50) cache.delete(cache.keys().next().value!)
      cache.set(url, { expires: stamp + (value === null ? 30_000 : 180_000), value })
      return value
    } catch (error) {
      if (signal?.aborted) throw signal.reason
      if (controller.signal.aborted) throw new Error('Open Food Facts neodpovedalo včas. Skúste to znova.')
      if (error instanceof Error && error.name === 'Error') throw error
      throw new Error('Nepodarilo sa načítať údaje z Open Food Facts. Skontrolujte pripojenie alebo použite manuálny zápis.')
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
    }
  }

  return {
    async search(query: string, market: Market, signal?: AbortSignal) {
      const term = query.trim()
      if (term.length < 2) throw new Error('Zadajte aspoň dva znaky názvu alebo značky.')
      const params = new URLSearchParams({
        search_terms: term, search_simple: '1', action: 'process', json: '1',
        page_size: '12', fields,
      })
      if (market !== 'all') {
        params.set('tagtype_0', 'countries')
        params.set('tag_contains_0', 'contains')
        params.set('tag_0', market === 'sk' ? 'slovakia' : 'czech-republic')
      }
      const payload = object(await request(`${host}/cgi/search.pl?${params}`, 'search', signal))
      if (!Array.isArray(payload?.products)) throw new Error('Open Food Facts vrátilo neúplnú odpoveď.')
      const products = payload.products.flatMap((row: unknown) => {
        const food = fromOpenFoodFacts(row, market)
        return food ? [food] : []
      })
      return [...new Map(products.map((food) => [food.id, food])).values()]
    },
    async product(input: string, signal?: AbortSignal, fresh = false) {
      const code = validGtin(input)
      if (!code) throw new Error('Zadajte platný EAN alebo GTIN s kontrolnou číslicou.')
      const params = new URLSearchParams({ fields })
      const raw = await request(`${host}/api/v3.6/product/${offBarcode(code)}.json?${params}`, 'product', signal, fresh)
      if (raw === null) return undefined
      const payload = object(raw)
      if (payload?.status === 0 || object(payload?.result)?.id === 'product_not_found') return undefined
      const food = fromOpenFoodFacts(payload?.product)
      if (food && equivalentGtin(food.barcode, code)) return food
      throw new Error('Open Food Facts vrátilo neúplné alebo nezodpovedajúce údaje.')
    },
  }
}

export const openFoodFacts = openFoodFactsClient()
