import { expect, test } from '@playwright/test'

test('sprístupní šesť obrazoviek a zvýrazní aktuálnu trasu', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Dnes' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'sk')
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(await page.evaluate(() => document.documentElement.clientWidth))

  await page.getByRole('link', { name: 'Pridať jedlo' }).click()
  await expect(page.getByRole('heading', { name: 'Pridať jedlo' })).toBeVisible()

  const navigation = page.getByRole('navigation', { name: 'Hlavná navigácia' })
  const screens = [
    ['Dnes', 'Dnes'],
    ['Pridať', 'Pridať jedlo'],
    ['Denník', 'Denník'],
    ['Analýza', 'Analýza'],
    ['Merania', 'Merania'],
    ['Nastavenia', 'Nastavenia'],
  ] as const

  for (const [label, heading] of screens) {
    const link = navigation.getByRole('link', { name: label, exact: true })
    await link.click()
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    await expect(link).toHaveAttribute('aria-current', 'page')
    await expect(page).toHaveTitle(`${heading} · NutriTrack`)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  }
})

test('otvorí priamy odkaz, obnoví ho a umožní návrat z neznámej trasy', async ({ page }) => {
  await page.goto('./#/dennik')
  await expect(page.getByRole('heading', { name: 'Denník' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Denník' })).toBeVisible()

  await page.goto('./#/neznama')
  await expect(page.getByRole('heading', { name: 'Stránka sa nenašla' })).toBeVisible()
  await page.getByRole('link', { name: 'Späť na Dnes' }).click()
  await expect(page.getByRole('heading', { name: 'Dnes' })).toBeVisible()
})

test('reaguje na zmenu systémovej témy počas otvorenej stránky', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('./')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(243, 245, 239)')

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(21, 28, 25)')
})

test('pri otvorení inicializuje skutočné lokálne úložisko prehliadača', async ({ page }) => {
  await page.goto('./')
  await page.waitForFunction(async () =>
    (await indexedDB.databases()).some(({ name }) => name === 'nutritrack'),
  )
  const stores = await page.evaluate(() => new Promise<string[]>((resolve, reject) => {
    const request = indexedDB.open('nutritrack')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const connection = request.result
      resolve(Array.from(connection.objectStoreNames))
      connection.close()
    }
  }))

  expect(stores).toEqual(expect.arrayContaining(['mealEntries', 'journalDays', 'preferences']))
})

test('po prvom načítaní otvorí obálku bez siete v novej karte', async ({ context, page, baseURL }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Dnes' })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  const pwa = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    const manifestUrl = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href
    const manifest = await fetch(manifestUrl).then((response) => response.json())
    const icon = await fetch(new URL(manifest.icons[0].src, manifestUrl))
    return {
      registrationScope: registration.scope,
      worker: navigator.serviceWorker.controller?.scriptURL,
      manifestUrl,
      start: new URL(manifest.start_url, manifestUrl).href,
      scope: new URL(manifest.scope, manifestUrl).href,
      icon: icon.headers.get('content-type'),
    }
  })
  expect(pwa).toEqual({
    registrationScope: baseURL,
    worker: new URL('sw.js', baseURL).href,
    manifestUrl: new URL('manifest.webmanifest', baseURL).href,
    start: baseURL,
    scope: baseURL,
    icon: 'image/png',
  })

  await page.close()
  await context.setOffline(true)
  const offlinePage = await context.newPage()
  await offlinePage.goto('./#/merania')
  await expect(offlinePage.getByRole('heading', { name: 'Merania' })).toBeVisible()
  await expect(offlinePage.getByRole('alert')).toHaveCount(0)

  await offlinePage.getByRole('link', { name: 'Denník' }).click()
  await expect(offlinePage.getByRole('heading', { name: 'Denník' })).toBeVisible()
  await offlinePage.reload()
  await expect(offlinePage.getByRole('heading', { name: 'Denník' })).toBeVisible()
})
