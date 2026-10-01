import { expect, test, type Page } from '@playwright/test'

const populationOf = async (page: Page) =>
  Number(/Population : (\d+)/.exec((await page.getByTestId('population').textContent()) ?? '')?.[1])

test('les pouvoirs divins agissent sur le monde', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('population')).toContainText('herbivores')
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(300)
  const box = (await page.getByTestId('world-canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  // observer : un clic ne change rien
  const base = await populationOf(page)
  await page.mouse.click(cx, cy)
  await page.waitForTimeout(300)
  expect(await populationOf(page)).toBe(base)

  // semer des herbivores
  await page.getByTestId('tool-herbivore').click()
  await page.mouse.click(cx, cy)
  await expect.poll(() => populationOf(page)).toBe(base + 10)
  await expect(page.getByTestId('god-message')).toContainText('Herbivores créés')

  // météorite au rayon maximal (≈ 8 % de la carte) : la population chute
  await page.getByTestId('tool-meteor').click()
  await page.getByTestId('radius').fill('40')
  const before = await populationOf(page)
  await page.mouse.click(cx, cy)
  await expect.poll(() => populationOf(page)).toBeLessThan(before - 20)

  // météo
  await page.getByTestId('weather-drought').click()
  await expect(page.getByTestId('god-message')).toContainText('Sécheresse')
  await page.getByTestId('weather-rain').click()
  await expect(page.getByTestId('god-message')).toContainText('pleut')

  // glisser pour déplacer la caméra n'applique pas l'outil
  await page.getByTestId('tool-carnivore').click()
  const pop = await populationOf(page)
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 60, cy + 30, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  expect(await populationOf(page)).toBe(pop)
})
