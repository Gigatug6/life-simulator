import { expect, test } from '@playwright/test'

test("the evolution charts fill up and survive a reload", async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('population')).toContainText('herbivores')
  await page.getByRole('button', { name: '×64' }).click()
  await expect(page.getByTestId('charts')).toBeVisible({ timeout: 30_000 })
  await expect.poll(async () => page.locator('[data-testid="chart-population"] path').first().getAttribute('d').then((d) => (d ?? '').split('L').length), { timeout: 30_000 }).toBeGreaterThan(5)
  await expect(page.getByTestId('chart-intelligence')).toBeVisible()
  await expect(page.getByTestId('chart-body')).toBeVisible() // mean herbivore body plan over time
  await expect(page.getByTestId('chart-kinds')).toBeVisible() // share of non-classic neurons over time
  // intelligence index in the top bar: a 0-100 value and a named level
  await expect(page.getByTestId('iq')).toHaveText(/Intelligence : \d+ · (Errants|Fourrageurs|Stratèges|Sages)/)
  // hover: tooltip
  const svg = page.locator('[data-testid="chart-population"] svg')
  const box = (await svg.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5)
  await expect(page.locator('[data-testid="chart-population"] .tip')).toBeVisible()
  // accessible table
  await page.getByRole('button', { name: 'Voir le tableau' }).first().click()
  await expect(page.locator('[data-testid="chart-population"] table')).toBeVisible()
  await page.screenshot({ path: 'artifacts/screens/charts.png' })

  await page.getByRole('button', { name: 'Pause' }).click()
  await page.getByTestId('menu-toggle').click()
  await page.getByRole('menuitem', { name: 'Sauvegarder' }).click()
  await expect(page.getByTestId('saved')).toContainText('Sauvegardé à')
  const n = await page.locator('[data-testid="chart-population"] path').first().getAttribute('d').then((d) => (d ?? '').split('L').length)
  await page.reload()
  await expect(page.getByTestId('status')).toContainText('Monde repris')
  await expect(page.getByTestId('charts')).toBeVisible()
  const n2 = await page.locator('[data-testid="chart-population"] path').first().getAttribute('d').then((d) => (d ?? '').split('L').length)
  expect(n2).toBeGreaterThanOrEqual(n - 1)
})
