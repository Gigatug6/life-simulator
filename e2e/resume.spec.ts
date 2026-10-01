import { expect, test } from '@playwright/test'

const tickOf = async (page: import('@playwright/test').Page) =>
  Number(/Tick : (\d+)/.exec((await page.getByTestId('ticks').textContent()) ?? '')?.[1])

test('recharger la page reprend le même monde depuis le cache du navigateur', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('status')).toContainText('Moteur WASM prêt')
  await page.getByRole('button', { name: '×16' }).click()
  await expect.poll(() => tickOf(page)).toBeGreaterThan(200)
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(200)
  const before = await tickOf(page)
  await page.getByRole('button', { name: 'Sauvegarder' }).click()
  await expect(page.getByTestId('saved')).toContainText('Sauvegardé à')

  await page.reload()
  await expect(page.getByTestId('status')).toContainText('Monde repris')
  await expect.poll(() => tickOf(page)).toBeGreaterThanOrEqual(before)
  expect(await tickOf(page)).toBeLessThan(before + 200) // pas un nouveau monde à 0, ni un bond
})
