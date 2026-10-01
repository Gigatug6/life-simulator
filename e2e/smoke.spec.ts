import { expect, test } from '@playwright/test'

test('the WASM engine runs in the worker and brings creatures to life', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('status')).toContainText('Moteur WASM prêt')
  await expect(page.getByTestId('population')).toContainText('herbivores')
  const tick = async () => Number(/Tick : (\d+)/.exec((await page.getByTestId('ticks').textContent()) ?? '')?.[1])
  const t1 = await tick()
  await page.getByRole('button', { name: '×16' }).click()
  await expect.poll(tick).toBeGreaterThan(t1 + 50)
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(300)
  const paused = await tick()
  await page.waitForTimeout(400)
  expect(await tick()).toBe(paused)
})
