import { expect, test, type Page } from '@playwright/test'

const populationOf = async (page: Page) =>
  Number(/Population : (\d+)/.exec((await page.getByTestId('population').textContent()) ?? '')?.[1])

test('the divine powers act on the world', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('population')).toContainText('herbivores')
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(300)
  const box = (await page.getByTestId('world-canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  // observe: a click changes nothing
  const base = await populationOf(page)
  await page.mouse.click(cx, cy)
  await page.waitForTimeout(300)
  expect(await populationOf(page)).toBe(base)

  // sow herbivores
  await page.getByTestId('tool-herbivore').click()
  await page.mouse.click(cx, cy)
  await expect.poll(() => populationOf(page)).toBe(base + 10)
  await expect(page.getByTestId('god-message')).toContainText('Herbivores créés')

  // meteor at the maximum radius (≈ 8 % of the map): the population drops
  await page.getByTestId('tool-meteor').click()
  await page.getByTestId('radius').fill('40')
  const before = await populationOf(page)
  await page.mouse.click(cx, cy)
  await expect.poll(() => populationOf(page)).toBeLessThan(before - 20)

  // weather
  await page.getByTestId('weather-drought').click()
  await expect(page.getByTestId('god-message')).toContainText('Sécheresse')
  await page.getByTestId('weather-rain').click()
  await expect(page.getByTestId('god-message')).toContainText('pleut')

  // dragging to move the camera does not apply the tool
  await page.getByTestId('tool-carnivore').click()
  const pop = await populationOf(page)
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 60, cy + 30, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  expect(await populationOf(page)).toBe(pop)
})
