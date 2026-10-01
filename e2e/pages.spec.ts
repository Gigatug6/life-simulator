import { expect, test } from '@playwright/test'

// Checks that the site works from a sub-folder (GitHub Pages: /<repo>/):
// every resource (JS, worker, WASM) loads, with no 404 error and no console error.
test('the site loads and starts the engine (including under a sub-folder)', async ({ page }) => {
  const failed: string[] = []
  const errors: string[] = []
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`)
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto('./') // relative to the base address (BASE_URL), not to the domain root
  await expect(page.getByTestId('status')).toContainText('Moteur WASM prêt')
  await expect(page.getByTestId('population')).toContainText('herbivores')
  expect(failed).toEqual([])
  expect(errors).toEqual([])
})
