import { expect, test } from '@playwright/test'

test("l'inspecteur affiche une créature et son cerveau", async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('population')).toContainText('herbivores')
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(300)
  const box = (await page.getByTestId('world-canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  // on sème 10 herbivores au centre pour être sûr de viser une créature
  await page.getByTestId('tool-herbivore').click()
  await page.mouse.click(cx, cy)
  await page.waitForTimeout(300)

  await page.getByTestId('tool-inspect').click()
  await page.mouse.click(cx, cy)
  await expect(page.getByTestId('inspector')).toBeVisible()
  await expect(page.getByTestId('inspector-hidden')).toHaveText('4')
  await expect(page.getByTestId('brain')).toBeVisible()
  await page.screenshot({ path: 'artifacts/screens/inspector.png' })

  // la fiche suit la créature quand le temps passe
  const e1 = await page.getByTestId('inspector-energy').textContent()
  await page.getByRole('button', { name: '×4' }).click()
  await expect.poll(async () => page.getByTestId('inspector-energy').textContent()).not.toBe(e1)

  // fermeture
  await page.getByRole('button', { name: 'Fermer' }).click()
  await expect(page.getByTestId('inspector')).toHaveCount(0)
})
