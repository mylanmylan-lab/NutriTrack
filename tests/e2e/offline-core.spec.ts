import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { devices, expect, test, type Page } from '@playwright/test'

const date = '2026-10-12'

test.use({ actionTimeout: 12_000 })

async function catalog(page: Page) {
  await page.getByRole('navigation').getByRole('link', { name: 'Pridať', exact: true }).click()
  const back = page.getByRole('button', { name: 'Späť na výber' })
  if (await back.isVisible()) await back.click()
  await expect(page.getByRole('button', { name: 'Nová potravina' })).toBeVisible()
}

async function addFood(page: Page, {
  name, energy, brand, basis = 'g', state = 'raw', vitaminC, withPortions = false,
}: { name: string; energy: string; brand?: string; basis?: 'g' | 'ml'; state?: 'raw' | 'cooked'; vitaminC?: string; withPortions?: boolean }) {
  await page.getByRole('button', { name: 'Nová potravina' }).click()
  await page.getByLabel('Názov potraviny').fill(name)
  if (brand) await page.getByLabel('Značka').fill(brand)
  await page.getByLabel('Jednotka referencie').selectOption(basis)
  await page.getByLabel('Stav potraviny').selectOption(state)
  await page.getByLabel('Energia', { exact: true }).fill(energy)
  if (vitaminC) {
    await page.getByText('Ďalšie živiny, vitamíny a minerály', { exact: true }).click()
    await page.getByLabel('Vitamín C', { exact: true }).fill(vitaminC)
  }
  if (withPortions) {
    await page.getByRole('button', { name: 'Pridať kus alebo porciu' }).click()
    await page.getByLabel('Názov veľkosti').fill('Plátok')
    await page.getByLabel('Typ veľkosti').selectOption('piece')
    await page.getByLabel('Veľkosť', { exact: true }).fill('40')
    await page.getByRole('button', { name: 'Pridať kus alebo porciu' }).click()
    await page.getByLabel('Názov veľkosti').last().fill('Bežná porcia')
    await page.getByLabel('Veľkosť', { exact: true }).last().fill('80')
  }
  await page.getByRole('button', { name: 'Uložiť potravinu' }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
}

async function logSelected(page: Page, amount: string, category = 'breakfast') {
  await page.getByLabel('Množstvo', { exact: true }).fill(amount)
  await page.getByLabel('Dátum', { exact: true }).fill(date)
  await page.getByLabel('Čas', { exact: true }).fill('09:15')
  await page.getByRole('combobox', { name: 'Kategória', exact: true }).selectOption(category)
  await page.getByRole('button', { name: 'Zapísať do denníka' }).click()
  await expect(page.getByRole('heading', { name: 'Denník', exact: true })).toBeVisible()
}

const total = (page: Page) => page.getByRole('region', { name: 'Denný súčet' })

test('vyhľadá potravinu, zapamätá porciu a zachová históriu pri úprave aj zmazaní', async ({ page }, testInfo) => {
  test.setTimeout(75_000)
  await page.goto('./#/pridat')
  if (testInfo.project.name === 'webkit-iphone') expect(await page.evaluate(() => window.innerWidth)).toBe(390)
  await addFood(page, { name: 'Ražný chlieb', energy: '200', brand: 'Pekáreň', withPortions: true })
  await logSelected(page, '150')
  await expect(total(page).getByText('300 kcal', { exact: true })).toBeVisible()
  await expect(total(page).getByText('Údaj nie je dostupný', { exact: true }).first()).toBeVisible()
  await page.reload()
  await expect(total(page).getByText('300 kcal', { exact: true })).toBeVisible()

  await catalog(page)
  await page.getByLabel('Hľadať v miestnom katalógu').fill('pekarEN')
  await page.getByRole('button', { name: 'Vybrať potravinu Ražný chlieb' }).click()
  await expect(page.getByLabel('Množstvo', { exact: true })).toHaveValue('150')
  const portion = page.getByLabel('Jednotka množstva')
  await expect(portion).toHaveValue('g')
  await expect(portion.locator('option').filter({ hasText: 'Porcia · Bežná porcia (80 g)' })).toHaveCount(1)
  await portion.selectOption({ label: 'Kus · Plátok (40 g)' })
  await logSelected(page, '2', 'lunch')
  await expect(total(page).getByText('460 kcal', { exact: true })).toBeVisible()

  await catalog(page)
  await page.getByRole('button', { name: 'Vybrať potravinu Ražný chlieb' }).click()
  await expect(page.getByLabel('Množstvo', { exact: true })).toHaveValue('2')
  await expect(page.getByLabel('Jednotka množstva')).toHaveValue(/^piece:/)
  await page.getByRole('button', { name: 'Späť na výber' }).click()
  await page.getByRole('button', { name: 'Upraviť potravinu Ražný chlieb' }).click()
  await page.getByLabel('Energia', { exact: true }).fill('500')
  await page.getByRole('button', { name: 'Uložiť potravinu' }).click()

  await page.goto(`./#/dennik?datum=${date}`)
  await expect(total(page).getByText('460 kcal', { exact: true })).toBeVisible()
  const first = page.getByRole('listitem').filter({ hasText: '150 g' })
  await first.getByRole('button', { name: 'Upraviť záznam' }).click()
  await first.getByLabel('Množstvo (g)').fill('100')
  await first.getByRole('button', { name: 'Uložiť záznam' }).click()
  await expect(total(page).getByText('360 kcal', { exact: true })).toBeVisible()
  const edited = page.getByRole('listitem').filter({ hasText: '100 g' })
  await edited.getByRole('button', { name: 'Kopírovať', exact: true }).click()
  await edited.getByLabel('Kopírovať na dátum').fill('2026-10-13')
  await edited.getByRole('button', { name: 'Kopírovať záznam' }).click()
  await expect(edited.getByRole('button', { name: 'Kopírovať záznam' })).toHaveCount(0)

  await catalog(page)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Zmazať potravinu Ražný chlieb' }).click()
  await expect(page.getByRole('button', { name: 'Vybrať potravinu Ražný chlieb' })).toHaveCount(0)
  await page.goto('./#/dennik?datum=2026-10-13')
  await expect(total(page).getByText('200 kcal', { exact: true })).toBeVisible()
  await expect(page.getByText('Ražný chlieb', { exact: true })).toBeVisible()
  const remove = page.getByRole('button', { name: 'Zmazať záznam' })
  page.once('dialog', (dialog) => dialog.dismiss())
  await remove.click()
  await expect(total(page).getByText('200 kcal', { exact: true })).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await remove.click()
  await expect(page.getByText('Denník je prázdny.', { exact: true })).toBeVisible()
})

test('v recepte prepočíta gramy aj mililitre a v analýze ukáže čiastočné mikronutrienty', async ({ page }) => {
  test.setTimeout(65_000)
  await page.goto('./#/pridat')
  await addFood(page, { name: 'Surovina A', energy: '200', vitaminC: '12' })
  await catalog(page)
  await addFood(page, { name: 'Surovina B', energy: '50', basis: 'ml', state: 'cooked' })
  await catalog(page)
  await page.getByRole('button', { name: 'Nový recept' }).click()
  await page.getByLabel('Názov receptu').fill('Raňajkový recept')
  await page.getByLabel('Počet porcií').fill('2')
  const first = page.getByRole('group', { name: 'Surovina 1' })
  await first.getByLabel('Potravina').selectOption({ label: 'Surovina A' })
  await first.getByLabel('Množstvo', { exact: true }).fill('100')
  await page.getByRole('button', { name: 'Pridať surovinu' }).click()
  const second = page.getByRole('group', { name: 'Surovina 2' })
  await second.getByLabel('Potravina').selectOption({ label: 'Surovina B' })
  await expect(second.getByLabel('Jednotka množstva')).toHaveValue('ml')
  await second.getByLabel('Množstvo', { exact: true }).fill('100')
  await page.getByRole('button', { name: 'Uložiť recept' }).click()
  await expect(page.getByRole('heading', { name: 'Raňajkový recept' })).toBeVisible()
  await logSelected(page, '1')
  await expect(total(page).getByText('125 kcal', { exact: true })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Deň je kompletne zaznamenaný' }).click()
  await expect(page.getByLabel('Deň je kompletne zaznamenaný')).toBeChecked()
  await page.goto(`./#/analyza?datum=${date}`)
  await expect(page.getByText('Kompletne zaznamenaný deň.')).toBeVisible()
  await expect(total(page).getByText('Vitamín C', { exact: true })).toBeVisible()
  await expect(total(page).getByText('6 mg', { exact: false })).toBeVisible()
  await expect(total(page).getByText('Neúplný údaj v recepte', { exact: true })).toBeVisible()
})

test('potvrdí cieľ, uloží meranie a obnoví zálohu po prezretí náhľadu', async ({ page }) => {
  test.setTimeout(65_000)
  await page.goto('./#/merania')
  await page.getByRole('button', { name: 'Pridať meranie' }).click()
  await page.getByLabel('Dátum merania').fill(date)
  await page.getByLabel('Hmotnosť (kg)', { exact: true }).fill('70,25')
  await page.getByLabel('Obvod pásu (cm)').fill('82')
  await page.getByLabel('Poznámka').fill('Ráno pri meraní')
  await page.getByRole('button', { name: 'Uložiť meranie' }).click()
  await expect(page.getByText('70,25 kg · 82 cm')).toBeVisible()

  await page.getByRole('link', { name: 'Nastavenia' }).click()
  await page.getByLabel('Vek v rokoch').fill('30')
  await page.getByRole('combobox', { name: 'Pohlavie pre výpočet' }).selectOption('female')
  await page.getByRole('combobox', { name: 'Úroveň aktivity' }).selectOption('light')
  await page.getByLabel('Výška (cm)').fill('170')
  await page.getByLabel('Hmotnosť pre výpočet (kg)').fill('70')
  await page.getByRole('button', { name: 'Uložiť profil' }).click()
  await expect(page.getByText(/Odhad denného výdaja podľa Mifflin–St Jeor:/)).toBeVisible()
  await page.getByLabel('Ručný cieľ (kcal/deň)').fill('1950')
  await page.getByRole('button', { name: 'Zobraziť návrh cieľa' }).click()
  await expect(page.getByText('Zatiaľ nemáte potvrdený cieľ.')).toBeVisible()
  await page.getByRole('button', { name: 'Potvrdiť cieľ' }).click()
  await expect(page.getByText(/Potvrdený cieľ:.*kcal za deň/)).toBeVisible()
  await page.getByRole('combobox', { name: 'Téma', exact: true }).selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('button', { name: 'Pripraviť JSON zálohu' }).click()
  const backupLink = page.getByRole('link', { name: /Stiahnuť NutriTrack-.*\.json/ })
  await expect(backupLink).toBeVisible()
  const backup = await backupLink.evaluate(async (element) => (await fetch((element as HTMLAnchorElement).href)).text())
  const downloadPromise = page.waitForEvent('download')
  await backupLink.click()
  expect((await downloadPromise).suggestedFilename()).toMatch(/^NutriTrack-.*\.json$/)

  await page.getByRole('button', { name: 'CSV meraní' }).click()
  const csvLink = page.getByRole('link', { name: 'Stiahnuť NutriTrack-merania.csv' })
  await expect(csvLink).toBeVisible()
  const csv = await csvLink.evaluate(async (element) => (await fetch((element as HTMLAnchorElement).href)).text())
  expect(csv).toContain('2026-10-12;70,25;82;Ráno pri meraní')

  const upload = page.getByLabel('Otvoriť JSON zálohu')
  await upload.setInputFiles({ name: 'poskodena.json', mimeType: 'application/json', buffer: Buffer.from('{broken') })
  await expect(page.getByRole('alert')).toContainText('platný JSON')
  await expect(page.getByText(/Potvrdený cieľ:.*kcal za deň/)).toBeVisible()

  await page.getByRole('combobox', { name: 'Téma', exact: true }).selectOption('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await upload.setInputFiles({ name: 'zaloha.json', mimeType: 'application/json', buffer: Buffer.from(backup) })
  await expect(page.getByRole('region', { name: 'Náhľad zálohy' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Obnoviť a prepísať údaje' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Záloha je obnovená.' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('zachová denník po ukončení prehliadača a umožní zápis a export offline', async ({ playwright, browserName, baseURL }) => {
  test.setTimeout(70_000)
  const path = await mkdtemp(join(tmpdir(), 'nutritrack-e2e-'))
  const browser = playwright[browserName]
  const device = browserName === 'webkit' ? devices['iPhone 14'] : devices['Desktop Chrome']
  const options = { ...device, baseURL: baseURL!, headless: true }
  let persistent = await browser.launchPersistentContext(path, options)
  try {
    const page = persistent.pages()[0] ?? await persistent.newPage()
    await page.goto('./#/pridat')
    await addFood(page, { name: 'Položka testu offline', energy: '200' })
    await logSelected(page, '150')
    await expect(total(page).getByText('300 kcal', { exact: true })).toBeVisible()
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
    await persistent.close()

    persistent = await browser.launchPersistentContext(path, options)
    await persistent.setOffline(true)
    const offline = persistent.pages()[0] ?? await persistent.newPage()
    await offline.goto(`./#/dennik?datum=${date}`)
    await expect(total(offline).getByText('300 kcal', { exact: true })).toBeVisible()
    await catalog(offline)
    await offline.getByRole('button', { name: 'Vybrať potravinu Položka testu offline' }).click()
    await logSelected(offline, '25', 'snack')
    await offline.reload()
    await expect(total(offline).getByText('350 kcal', { exact: true })).toBeVisible()
    await offline.getByRole('link', { name: 'Nastavenia' }).click()
    await offline.getByRole('button', { name: 'Pripraviť JSON zálohu' }).click()
    await expect(offline.getByRole('link', { name: /Stiahnuť NutriTrack-.*\.json/ })).toBeVisible()
  } finally {
    await persistent.close()
    await rm(path, { recursive: true, force: true })
  }
})
