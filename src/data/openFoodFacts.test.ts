import { describe, expect, it, vi } from 'vitest'
import { ean13Modules } from '../../tests/fixtures/barcode'
import { createBarcodeDecoder } from './barcodeDecoder'
import { basicFoods } from './basicFoods'
import { equivalentGtin, expandUpcE, offBarcode, validGtin } from './gtin'
import { fromOpenFoodFacts, openFoodFactsClient } from './openFoodFacts'

const code = '3017620422003'
const knownProduct = {
  code, product_name: 'Test product', product_name_sk: 'Skúšobný výrobok', product_name_cs: 'Zkušební výrobek',
  brands: 'Test značka', product_quantity: 0.15, product_quantity_unit: 'l', last_modified_t: 1795370414,
  nutrition: {
    aggregated_set: {
      per: '100ml', preparation: 'as_sold',
      nutrients: {
        'energy-kj': { value: 418.4, unit: 'kJ', source: 'manufacturer' },
        proteins: { value: 0, unit: 'g', source: 'packaging' },
        'vitamin-c': { value: 0.003, unit: 'g', source: 'packaging' },
        'vitamin-a': { value: 5, unit: 'g', source: 'estimate' },
        zinc: { value: 2, unit: 'mg', modifier: '<', source: 'packaging' },
      },
    },
    input_sets: [
      { per: '100g', preparation: 'as_sold', source: 'packaging', nutrients: { fat: { value: 10, unit: 'g' } } },
      { per: '100ml', preparation: 'prepared', source: 'packaging', nutrients: { sugars: { value: 20, unit: 'g' } } },
    ],
  },
}

describe('Open Food Facts a GTIN', () => {
  it('normalizuje objem, kJ a mikroživiny, zachová nulu a vynechá odhady, hranice a inú bázu', () => {
    const food = fromOpenFoodFacts(knownProduct, 'cs')!
    expect(food).toMatchObject({
      name: 'Zkušební výrobek', barcode: code, package: { value: 150, unit: 'ml' },
      source: { kind: 'openFoodFacts', externalId: code, version: '1795370414' },
      nutrition: { basis: { unit: 'ml', value: 100 } },
    })
    const nutrients = Object.fromEntries(food.nutrition.nutrients.map(({ id, value }) => [id, value]))
    expect(nutrients.energy).toBeCloseTo(100)
    expect(nutrients.protein).toBe(0)
    expect(nutrients.vitaminC).toBeCloseTo(3)
    for (const id of ['vitaminA', 'zinc', 'fat', 'sugars', 'iron']) expect(nutrients[id]).toBeNull()
  })

  it('pri starom formáte číta len normalizované hodnoty a ignoruje odhadované a pripravené údaje', () => {
    const food = fromOpenFoodFacts({
      code, quantity: '150 g ℮', nutrition_data_per: '100g',
      nutriments: { 'energy-kcal_100g': 200, vitaminC_unit: 'mg', 'vitamin-c_100g': 0.003, fat_prepared_100g: 3, sodium_100g: 0.04, iron_serving: 0.1 },
      nutriments_estimated: { zinc_100g: 0 },
    })!
    expect(food.package).toEqual({ unit: 'g', value: 150 })
    expect(food.nutrition.nutrients).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'energy', unit: 'kcal', value: 200 }),
      expect.objectContaining({ id: 'vitaminC', unit: 'mg', value: 3 }),
      expect.objectContaining({ id: 'sodium', unit: 'mg', value: 40 }),
      expect.objectContaining({ id: 'fat', value: null }),
      expect.objectContaining({ id: 'zinc', value: null }),
    ]))
  })

  it('overí kontrolné číslice a ekvivalenciu EAN, UPC a GTIN s nulami', () => {
    expect(validGtin(' 3017620422003 ')).toBe(code)
    expect(validGtin('3017620422004')).toBeUndefined()
    expect(validGtin('00000000')).toBeUndefined()
    expect(validGtin('96385074')).toBe('96385074')
    expect(validGtin('00000096385074')).toBe('00000096385074')
    expect(equivalentGtin('036000291452', '0036000291452')).toBe(true)
    expect(offBarcode('036000291452')).toBe('0036000291452')
    expect(expandUpcE('04252614')).toBe('042100005264')
  })

  it('vyhľadá trh cez dokumentovaný dotaz, označí klienta a znovu použije výsledok', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ products: [knownProduct, knownProduct, { code: 'x' }] }))
    const client = openFoodFactsClient(fetcher)
    expect(await client.search('test značka', 'sk')).toHaveLength(1)
    expect(await client.search('test značka', 'sk')).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, request] = fetcher.mock.calls[0]!
    const parsed = new URL(String(url))
    expect(parsed.pathname).toBe('/cgi/search.pl')
    expect(parsed.searchParams.get('search_terms')).toBe('test značka')
    expect(parsed.searchParams.get('tag_0')).toBe('slovakia')
    expect(new Headers(request?.headers).get('X-User-Agent')).toContain('NutriTrack')
    expect(request?.credentials).toBe('omit')
  })

  it('rozpozná 404 a rešpektuje Retry-After bez automatického opakovania', async () => {
    let now = 10_000
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '12' } }))
      .mockResolvedValueOnce(Response.json({ product: knownProduct }))
    const client = openFoodFactsClient(fetcher, () => now)
    expect(await client.product(code)).toBeUndefined()
    await expect(client.product(code, undefined, true)).rejects.toThrow('obmedzilo')
    await expect(client.product(code, undefined, true)).rejects.toThrow('Limit')
    expect(fetcher).toHaveBeenCalledTimes(2)
    now += 12_000
    expect((await client.product(code, undefined, true))?.barcode).toBe(code)
  })

  it('dodrží lokálny limit vyhľadávania a zruší časovo vyčerpaný dotaz', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ products: [] }))
    const client = openFoodFactsClient(fetcher)
    for (let i = 0; i < 8; i += 1) await client.search(`názov ${i}`, 'all')
    await expect(client.search('ďalší dotaz', 'all')).rejects.toThrow('Limit')
    expect(fetcher).toHaveBeenCalledTimes(8)
    const never = vi.fn<typeof fetch>((_url, request) => new Promise((_, reject) => {
      request?.signal?.addEventListener('abort', () => reject(request.signal?.reason))
    }))
    await expect(openFoodFactsClient(never, Date.now, 10).product(code)).rejects.toThrow('včas')
  })
})

it('dekóduje skutočnú simulovanú snímku EAN-13 a ignoruje prázdnu snímku', () => {
  const bits = ean13Modules(code)
  const width = bits.length * 4
  const height = 80
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (bits[Math.floor(x / 4)] === '1') data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3)
    }
  }
  const decode = createBarcodeDecoder()
  expect(decode({ data, width, height, colorSpace: 'srgb' })).toBe(code)
  expect(decode({ data: data.fill(255), width, height, colorSpace: 'srgb' })).toBeUndefined()
})

it('obsahuje overiteľné offline suroviny USDA s pôvodnými hodnotami a identifikátormi', () => {
  expect(basicFoods).toHaveLength(21)
  const apple = basicFoods.find(({ id }) => id === 'usda:1750341')!
  expect(apple.source).toEqual({ kind: 'usda', externalId: '1750341', version: 'Foundation Foods 2026-10-29' })
  expect(apple.nutrition.basis).toEqual({ unit: 'g', value: 100 })
  expect(apple.nutrition.nutrients).toContainEqual(expect.objectContaining({ id: 'energy', value: 54.9 }))
})
