import { expect, test, type Page } from '@playwright/test'
import { shiftDay } from '../../src/data/dates'
import type { MealEntry, Nutrient, Profile } from '../../src/data/model'

const source = { kind: 'local' } as const
const profile: Profile = {
  id: 'local', age: { birthDate: '1996-01-01' }, formulaSex: 'male',
  heightCm: 175, weightKg: 70, activityLevel: 'sedentary',
}

function entry(date: string, kcal: number, extra: Partial<MealEntry> = {}): MealEntry {
  const nutrients: Nutrient[] = [
    { id: 'energy', value: kcal, unit: 'kcal', source },
    { id: 'vitaminC', value: 0, unit: 'mg', source },
  ]
  return {
    id: `test-${date}`, date, time: '12:00', categoryId: 'lunch', item: { type: 'food', id: 'older-food' },
    amount: { unit: 'g', value: 100 }, snapshot: {
      name: 'Testovacia položka', amount: { unit: 'g', value: 100, estimated: false }, sources: [source], nutrients,
    }, ...extra,
  }
}

async function seed(page: Page, tables: Record<string, object[]>) {
  await page.evaluate((data) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('nutritrack')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(Object.keys(data), 'readwrite')
      transaction.oncomplete = () => { db.close(); resolve() }
      transaction.onabort = () => { db.close(); reject(transaction.error) }
      for (const [name, rows] of Object.entries(data)) {
        for (const row of rows) transaction.objectStore(name).put(row)
      }
    }
  }), tables)
}

async function goalRecords(page: Page) {
  return page.evaluate(() => new Promise<{ energyTargetKcal: number; calculation: string }[]>((resolve, reject) => {
    const request = indexedDB.open('nutritrack')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const store = request.result
      const goals = store.transaction('goals').objectStore('goals').getAll()
      goals.onerror = () => { store.close(); reject(goals.error) }
      goals.onsuccess = () => { store.close(); resolve(goals.result) }
    }
  }))
}

test('analyzuje kompletné dni offline na 390 px a uloží viacnásobné označenia bez zmeny energie', async ({ page, context }) => {
  test.setTimeout(55_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const friday = '2026-10-16'
  const saturday = '2026-10-17'
  const sunday = '2026-10-18'
  await page.goto('./')
  await expect(page.getByText('Denník je prázdny.', { exact: true })).toBeVisible()
  await seed(page, {
    profiles: [profile],
    mealEntries: [entry(friday, 2000), entry(saturday, 2400), entry(sunday, 10000)],
    journalDays: [friday, saturday].map((date) => ({ date, completeness: 'complete' })),
    bodyMeasurements: [{ id: 'm1', date: friday, weightKg: 70, waistCm: 80 }, { id: 'm2', date: saturday, weightKg: 71, waistCm: 81 }],
    goals: [{ id: 'goal', direction: 'maintain', energyTargetKcal: 2000, calculation: 'manual', validFrom: friday, confirmedAt: `${friday}T08:00:00Z` }],
  })
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.goto(`./#/dennik?datum=${saturday}`)
  await page.getByRole('button', { name: 'Upraviť záznam' }).click()
  await page.getByText('Kontext jedla a označenia', { exact: true }).click()
  await page.getByRole('checkbox', { name: 'Chuť alebo pôžitok' }).check()
  await page.getByRole('checkbox', { name: 'Oddych' }).check()
  await page.getByRole('checkbox', { name: 'Sladkosti' }).check()
  await page.getByRole('combobox', { name: 'Kategória' }).selectOption('snack')
  await page.getByLabel('Čas', { exact: true }).fill('21:00')
  await page.getByRole('button', { name: 'Uložiť záznam' }).click()
  await expect(page.getByText('Chuť alebo pôžitok · Oddych · Sladkosti')).toBeVisible()

  await page.goto(`./#/analyza?datum=${sunday}`)
  const period = page.getByRole('group', { name: 'Obdobie analýzy' })
  await period.getByRole('button', { name: '7 dní', exact: true }).click()
  await expect(period.getByRole('button', { name: '7 dní', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const average = page.getByRole('region', { name: 'Priemerný denný príjem' })
  await expect(average.getByText('2 200 kcal/deň', { exact: true })).toBeVisible()
  await expect(average.getByText('+200 kcal/deň', { exact: true })).toBeVisible()
  await page.getByText('Neúplné dni a pokrytie obdobia', { exact: true }).click()
  await expect(page.getByText(/zapísaných 10\s?000 kcal/)).toBeVisible()
  await expect(page.getByRole('img', { name: /Hmotnosť, 2 meraní/ })).toBeVisible()
  await page.getByText('Príjem a pokrytie jednotlivých živín').click()
  const vitamin = page.getByRole('region', { name: 'Vitamíny a minerály' }).getByRole('definition')
    .filter({ hasText: /(^|\s)0 mg\/deň/ })
  await expect(vitamin).toBeVisible()
  await expect(vitamin).toContainText('0 % referencie')
  await page.getByText('Časy, dôvody a označené potraviny').click()
  await expect(page.getByText('Večerné občerstvenie od 20:00')).toBeVisible()
  await expect(page.getByText(/2\s?400 kcal spolu · 1 zápisov/).first()).toBeVisible()
  await period.getByRole('button', { name: '90 dní', exact: true }).click()
  await expect(average.getByText('2 200 kcal/deň', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.reload()
  await expect(average.getByText('2 200 kcal/deň', { exact: true })).toBeVisible()
})

test('kalibrovaný návrh zmení cieľ až výslovným potvrdením', async ({ page }) => {
  test.setTimeout(55_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await expect(page.getByText('Denník je prázdny.', { exact: true })).toBeVisible()
  const today = await page.evaluate(() => {
    const now = new Date()
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
  })
  const start = shiftDay(today, -56)
  const dates = Array.from({ length: 56 }, (_, index) => shiftDay(start, index))
  await seed(page, {
    profiles: [{ ...profile, activeGoalId: 'previous' }],
    goals: [{
      id: 'previous', direction: 'maintain', energyTargetKcal: 2050, calculation: 'manual',
      validFrom: start, confirmedAt: `${start}T00:00:00Z`,
    }],
    mealEntries: dates.map((date) => entry(date, 2150)),
    journalDays: dates.map((date) => ({ date, completeness: 'complete' })),
    bodyMeasurements: Array.from({ length: 8 }, (_, index) => ({
      id: `weight-${index}`, date: dates[index * 7], weightKg: 70 - index * 0.1,
    })),
  })
  await page.goto('./#/analyza')
  const section = page.getByRole('region', { name: 'Kalibrácia energetického výdaja' })
  await expect(section.getByText('56 z 56', { exact: true })).toBeVisible()
  const preview = section.getByRole('button', { name: 'Zobraziť kalibrovaný návrh cieľa' })
  await preview.click()
  expect(await goalRecords(page)).toHaveLength(1)
  await section.getByRole('button', { name: 'Zrušiť návrh' }).click()
  expect(await goalRecords(page)).toHaveLength(1)
  await preview.click()
  await section.getByRole('button', { name: 'Potvrdiť kalibrovaný cieľ' }).click()
  await expect(section.getByText('Kalibrovaný cieľ je uložený.')).toBeVisible()
  const goals = await goalRecords(page)
  expect(goals).toHaveLength(2)
  expect(goals.find(({ calculation }) => calculation === 'calibrated')?.energyTargetKcal).toBeGreaterThan(2050)
  expect(goals.find(({ calculation }) => calculation === 'manual')?.energyTargetKcal).toBe(2050)
})
