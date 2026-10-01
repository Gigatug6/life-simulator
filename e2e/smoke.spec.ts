import { expect, test } from '@playwright/test'

test('le moteur WASM démarre dans le worker', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('status')).toContainText('Moteur WASM prêt')
  await expect(page.getByTestId('ticks')).toContainText('Ticks : 10')
})
