import { expect, test } from '@playwright/test'

test("the inspector shows a creature and its brain", async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('population')).toContainText('herbivores')
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(300)
  const box = (await page.getByTestId('world-canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  // sow 10 herbivores at the centre to be sure to hit a creature
  await page.getByTestId('tool-herbivore').click()
  await page.mouse.click(cx, cy)
  await page.waitForTimeout(300)

  await page.getByTestId('tool-inspect').click()
  await page.mouse.click(cx, cy)
  await expect(page.getByTestId('inspector')).toBeVisible()
  await expect(page.getByTestId('inspector-hidden')).toHaveText('4')
  // heritable body plan: size multiplier near 1 for a founder
  await expect(page.getByTestId('inspector-size')).toHaveText(/×(0\.9\d|1\.0\d|1\.10)/)
  await expect(page.getByTestId('brain')).toBeVisible()
  await page.screenshot({ path: 'artifacts/screens/inspector.png' })

  // the card follows the creature as time passes
  const e1 = await page.getByTestId('inspector-energy').textContent()
  await page.getByRole('button', { name: '×4' }).click()
  await expect.poll(async () => page.getByTestId('inspector-energy').textContent()).not.toBe(e1)

  // closing
  await page.getByRole('button', { name: 'Fermer' }).click()
  await expect(page.getByTestId('inspector')).toHaveCount(0)
})
