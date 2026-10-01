import { expect, test } from '@playwright/test'

test("les courbes d'évolution se remplissent et survivent au rechargement", async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('population')).toContainText('herbivores')
  await page.getByRole('button', { name: '×64' }).click()
  await expect(page.getByTestId('charts')).toBeVisible({ timeout: 30_000 })
  await expect.poll(async () => page.locator('[data-testid="chart-population"] path').first().getAttribute('d').then((d) => (d ?? '').split('L').length), { timeout: 30_000 }).toBeGreaterThan(5)
  await expect(page.getByTestId('chart-intelligence')).toBeVisible()
  // indice d'intelligence dans la barre supérieure : valeur 0-100 et palier nommé
  await expect(page.getByTestId('iq')).toHaveText(/Intelligence : \d+ · (Errants|Fourrageurs|Stratèges|Sages)/)
  // survol : infobulle
  const svg = page.locator('[data-testid="chart-population"] svg')
  const box = (await svg.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5)
  await expect(page.locator('[data-testid="chart-population"] .tip')).toBeVisible()
  // tableau accessible
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
