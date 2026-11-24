import { expect, test, type Page } from '@playwright/test'
import { ean13Modules } from '../fixtures/barcode'

const gtin = '3017620422003'
const absent = '96385074'
const date = '2026-10-12'
const product = {
  code: gtin, product_name: 'Skúšobný nápoj', product_name_cs: 'Zkušební nápoj', product_name_sk: 'Skúšobný nápoj',
  brands: 'Skúšobná značka', product_quantity: 150, product_quantity_unit: 'ml', last_modified_t: 1795000000,
  nutrition: {
    aggregated_set: {
      per: '100ml', preparation: 'as_sold',
      nutrients: {
        'energy-kcal': { unit: 'kcal', value: 200, source: 'packaging' },
        proteins: { unit: 'g', value: 0, source: 'packaging' },
      },
    },
  },
}

type OffMockWindow = Window & { offMock: { requests: string[]; energy: number; failed: boolean } }
type CameraMockWindow = Window & { cameraMock: { starts: number; stops: number; mode: 'deny' | 'blank' | 'code' } }

test.use({ actionTimeout: 12_000 })

async function stubOff(page: Page) {
  await page.route('https://world.openfoodfacts.org/**', (route) => route.abort())
  await page.addInitScript(({ supplied }) => {
    const mocked = window as unknown as OffMockWindow
    mocked.offMock = { requests: [], energy: 200, failed: false }
    const actual = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
      if (url.hostname !== 'world.openfoodfacts.org') return actual(input, init)
      mocked.offMock.requests.push(url.href)
      if (mocked.offMock.failed) return new Response(null, { status: 503 })
      if (url.pathname === '/cgi/search.pl') {
        return Response.json({ products: [supplied] })
      }
      if (url.pathname.endsWith(`/${supplied.code}.json`)) {
        const revision = structuredClone(supplied)
        revision.nutrition.aggregated_set.nutrients['energy-kcal'].value = mocked.offMock.energy
        revision.last_modified_t += mocked.offMock.requests.length
        return Response.json({ status: 'success', product: revision })
      }
      return new Response(null, { status: 404 })
    }
  }, { supplied: product })
}

async function stubCamera(page: Page) {
  await page.addInitScript(({ bits }) => {
    const mocked = window as unknown as CameraMockWindow
    mocked.cameraMock = { starts: 0, stops: 0, mode: 'deny' }
    const width = bits.length * 4
    const height = 80
    const track = { stop: () => { mocked.cameraMock.stops += 1 }, addEventListener() {} }
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
    const mediaDevices = navigator.mediaDevices ?? {}
    Object.defineProperty(navigator, 'mediaDevices', { value: mediaDevices, configurable: true })
    Object.defineProperty(mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      mocked.cameraMock.starts += 1
      if (mocked.cameraMock.mode === 'deny') throw new DOMException('Test refusal', 'NotAllowedError')
      return stream
    } })
    const sources = new WeakMap<HTMLVideoElement, unknown>()
    Object.defineProperties(HTMLVideoElement.prototype, {
      srcObject: { configurable: true, get() { return sources.get(this) }, set(value) { sources.set(this, value) } },
      readyState: { configurable: true, get() { return 4 } },
      videoWidth: { configurable: true, get() { return width } },
      videoHeight: { configurable: true, get() { return height } },
      play: { configurable: true, value: async () => undefined },
    })
    const draw = CanvasRenderingContext2D.prototype.drawImage
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'drawImage', {
      configurable: true,
      value(this: CanvasRenderingContext2D, ...args: unknown[]) {
        if (!(args[0] instanceof HTMLVideoElement)) return Reflect.apply(draw, this, args)
        this.fillStyle = '#fff'
        this.fillRect(0, 0, width, height)
        if (mocked.cameraMock.mode === 'code') {
          this.fillStyle = '#000'
          for (const [index, bit] of [...bits].entries()) {
            if (bit === '1') this.fillRect(index * 4, 0, 4, height)
          }
        }
      },
    })
  }, { bits: ean13Modules(gtin) })
}

const total = (page: Page) => page.getByRole('region', { name: 'Denný súčet' })
const catalog = (page: Page) => page.getByRole('navigation').getByRole('link', { name: 'Pridať', exact: true })
const barcode = (page: Page) => page.getByRole('button', { name: 'Čiarový kód', exact: true })
const unit = (page: Page) => page.getByRole('combobox', { name: 'Jednotka množstva', exact: true })

async function record(page: Page, targetDate = date, category = 'breakfast') {
  await page.getByLabel('Dátum', { exact: true }).fill(targetDate)
  await page.getByLabel('Čas', { exact: true }).fill('09:15')
  await page.getByRole('combobox', { name: 'Kategória', exact: true }).selectOption(category)
  await page.getByRole('button', { name: 'Zapísať do denníka' }).click()
  await expect(page.getByRole('heading', { name: 'Denník', exact: true })).toBeVisible()
}

test('vyhľadá český výrobok, importuje objemové údaje a aktualizuje ho bez zmeny denníka', async ({ page }) => {
  test.setTimeout(60_000)
  await stubOff(page)
  await page.goto('./#/pridat')
  await page.getByRole('button', { name: 'Open Food Facts', exact: true }).click()
  await page.getByLabel('Názov alebo značka výrobku').fill('Skúšobná značka')
  await page.getByRole('combobox', { name: 'Trh' }).selectOption('cs')
  await page.getByRole('button', { name: 'Hľadať v Open Food Facts' }).click()
  await page.getByRole('button', { name: 'Zobraziť údaje Zkušební nápoj' }).click()
  await page.getByText('Výživové údaje na 100 ml', { exact: true }).click()
  await expect(page.getByText('0 g', { exact: true })).toBeVisible()
  await expect(page.getByText('Údaj nie je dostupný', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Food Facts', exact: true }).last()).toHaveAttribute('href', `https://world.openfoodfacts.org/product/${gtin}`)
  await page.getByRole('button', { name: 'Uložiť do katalógu' }).click()
  await expect(page.getByRole('heading', { name: 'Zkušební nápoj' })).toBeVisible()
  await expect(unit(page)).toHaveValue('ml')
  await unit(page).selectOption({ label: '1/3 balenia (50 ml)' })
  await record(page, date, 'lunch')
  await expect(total(page).getByText('100 kcal', { exact: true })).toBeVisible()

  const requests = await page.evaluate(() => (window as unknown as OffMockWindow).offMock.requests)
  expect(new URL(requests[0]!).searchParams.get('tag_0')).toBe('czech-republic')
  expect(requests).toHaveLength(2)
  await page.evaluate(() => { (window as unknown as OffMockWindow).offMock.energy = 400 })
  await catalog(page).click()
  await barcode(page).click()
  await page.getByLabel('Zadať čiarový kód').fill(gtin)
  await page.getByRole('button', { name: 'Vyhľadať podľa kódu' }).click()
  await expect(unit(page)).toHaveValue('package:1:3')
  await expect(page.getByRole('combobox', { name: 'Kategória' })).toHaveValue('lunch')
  expect(await page.evaluate(() => (window as unknown as OffMockWindow).offMock.requests.length)).toBe(2)
  await page.getByRole('button', { name: 'Aktualizovať z Open Food Facts' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Údaje v katalógu sú aktualizované.' })).toBeVisible()
  await record(page)
  await expect(total(page).getByText('300 kcal', { exact: true })).toBeVisible()
  await page.reload()
  await expect(total(page).getByText('300 kcal', { exact: true })).toBeVisible()
})

test('simuluje záber EAN, skontroluje povolenie a uvoľnenie kamery aj manuálnu alternatívu', async ({ page }) => {
  test.setTimeout(60_000)
  await stubOff(page)
  await stubCamera(page)
  await page.goto('./#/pridat')
  await barcode(page).click()
  const readCamera = () => page.evaluate(() => (window as unknown as CameraMockWindow).cameraMock)
  const setMode = (mode: 'deny' | 'blank' | 'code') => page.evaluate((value) => {
    (window as unknown as CameraMockWindow).cameraMock.mode = value
  }, mode)
  expect((await readCamera()).starts).toBe(0)

  const start = page.getByRole('button', { name: 'Spustiť kameru' })
  await start.click()
  await expect(page.getByRole('alert')).toContainText('zamietnutý')
  await setMode('blank')
  await start.click()
  await expect(page.getByLabel('Náhľad kamery')).toBeVisible()
  await page.getByRole('button', { name: 'Zatvoriť skener' }).click()
  await expect.poll(async () => (await readCamera()).stops).toBe(1)

  await setMode('code')
  await start.click()
  await expect(page.getByRole('heading', { name: 'Skúšobný nápoj' })).toBeVisible()
  expect((await readCamera()).stops).toBe(2)
  expect((await readCamera()).starts).toBe(3)
  await page.getByLabel('Zadať čiarový kód').fill(absent)
  await page.getByRole('button', { name: 'Vyhľadať podľa kódu' }).click()
  await expect(page.getByText('Výrobok s týmto kódom sa nenašiel.')).toBeVisible()
  await page.getByRole('button', { name: 'Vytvoriť potravinu s týmto kódom' }).click()
  await expect(page.getByLabel('EAN alebo GTIN')).toHaveValue(absent)
})

test('použije USDA, vlastné balenie, obľúbené položky aj kombináciu výlučne offline', async ({ context, page }) => {
  test.setTimeout(65_000)
  await page.goto('./#/pridat')
  await expect(page.getByRole('button', { name: 'Základné suroviny', exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: 'Základné suroviny', exact: true }).click()
  await page.getByLabel('Hľadať základnú surovinu').fill('jablko')
  await page.getByRole('button', { name: 'Zobraziť údaje Jablko Gala so šupkou' }).click()
  await expect(page.getByRole('link', { name: 'USDA FoodData Central', exact: true }).last()).toHaveAttribute('href', /1750341/)
  await page.getByRole('button', { name: 'Uložiť do katalógu' }).click()
  await page.getByLabel('Množstvo', { exact: true }).fill('100')
  await record(page)
  await expect(total(page).getByText('54,9 kcal', { exact: true })).toBeVisible()

  await catalog(page).click()
  await page.getByRole('button', { name: 'Obľúbená potravina Jablko Gala so šupkou' }).click()
  await expect(page.getByRole('region', { name: 'Obľúbené potraviny' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Nedávno použité' })).toBeVisible()
  await page.getByRole('button', { name: 'Upraviť potravinu Jablko Gala so šupkou' }).click()
  await page.getByLabel('Veľkosť balenia').fill('150')
  await page.getByRole('button', { name: 'Uložiť potravinu' }).click()
  await expect(unit(page)).toHaveValue('g')
  await expect(unit(page).locator('option').filter({ hasText: '1/4 balenia (37,5 g)' })).toHaveCount(1)
  await expect(unit(page).locator('option').filter({ hasText: '1/2 balenia (75 g)' })).toHaveCount(1)
  await expect(unit(page).locator('option').filter({ hasText: 'Celé balenie (150 g)' })).toHaveCount(1)
  await unit(page).selectOption({ label: '1/3 balenia (50 g)' })
  await record(page)
  await expect(total(page).getByText('82,35 kcal', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Uložiť ako kombináciu' }).click()
  await page.getByLabel('Názov kombinácie').fill('Jablkové raňajky')
  await page.getByRole('button', { name: 'Uložiť kombináciu', exact: true }).click()
  await expect(page.getByText('Kombinácia je uložená.')).toBeVisible()
  await catalog(page).click()
  await page.getByRole('button', { name: 'Pridať kombináciu' }).click()
  await page.getByLabel('Dátum', { exact: true }).fill('2026-10-13')
  await page.getByRole('button', { name: 'Zapísať kombináciu do denníka' }).click()
  await expect(total(page).getByText('82,35 kcal', { exact: true })).toBeVisible()
  await page.reload()
  await expect(total(page).getByText('82,35 kcal', { exact: true })).toBeVisible()
})

test('pri nedostupnom API ponúkne manuálny zápis a neoznačí výrobok ako neexistujúci', async ({ page }) => {
  await stubOff(page)
  await page.goto('./#/pridat')
  await barcode(page).click()
  await page.evaluate(() => { (window as unknown as OffMockWindow).offMock.failed = true })
  await page.getByLabel('Zadať čiarový kód').fill(gtin)
  await page.getByRole('button', { name: 'Vyhľadať podľa kódu' }).click()
  await expect(page.getByRole('alert')).toContainText('dočasne nedostupné')
  await expect(page.getByText('Výrobok s týmto kódom sa nenašiel.')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Vytvoriť potravinu s týmto kódom' })).toBeVisible()
})
