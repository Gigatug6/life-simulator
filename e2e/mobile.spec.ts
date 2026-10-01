import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

test("the interface fits on a phone screen and responds to touch", async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('population')).toContainText('herbivores')
  // no horizontal page scrolling
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  // the charts are collapsed by default on mobile, the button opens them
  await expect(page.getByTestId('charts')).toHaveCount(0)
  await page.getByTestId('charts-toggle').tap()
  await page.getByRole('button', { name: '×64' }).tap()
  await expect(page.getByTestId('charts')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('charts-toggle').tap()
  await expect(page.getByTestId('charts')).toHaveCount(0)

  // the toolbar is usable: selection + touch on the world
  await page.getByRole('button', { name: 'Pause' }).tap()
  const count = async () => Number(/Population : (\d+)/.exec((await page.getByTestId('population').textContent()) ?? '')?.[1])
  await page.waitForTimeout(300)
  const before = await count()
  await page.getByTestId('tool-herbivore').tap()
  const box = (await page.getByTestId('world-canvas').boundingBox())!
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  await expect.poll(count).toBe(before + 10)

  // menu
  await page.getByTestId('menu-toggle').tap()
  await expect(page.getByTestId('menu')).toBeVisible()
  await page.screenshot({ path: 'artifacts/screens/mobile.png' })
})
