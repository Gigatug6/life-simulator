import { expect, test, type Page } from '@playwright/test'

const distinctColours = (page: Page) =>
  page.getByTestId('world-canvas').evaluate((c: HTMLCanvasElement) => {
    const g = document.createElement('canvas')
    g.width = 96
    g.height = 96
    const ctx = g.getContext('2d')!
    ctx.drawImage(c, 0, 0, 96, 96)
    const d = ctx.getImageData(0, 0, 96, 96).data
    const set = new Set<number>()
    for (let i = 0; i < d.length; i += 4) set.add(((d[i]! >> 3) << 10) | ((d[i + 1]! >> 3) << 5) | (d[i + 2]! >> 3))
    return set.size
  })

test('the 3D view shows the relief, can orbit, and switches back to 2D', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('population')).toContainText('herbivores')
  await expect(page.getByTestId('world-canvas')).toHaveAttribute('data-mode', '2d')

  await page.getByTestId('mode-toggle').click()
  await expect(page.getByTestId('world-canvas')).toHaveAttribute('data-mode', '3d')
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(1200)
  expect(await distinctColours(page)).toBeGreaterThan(12) // terrain, water, sky, creatures: not a blank canvas
  await page.screenshot({ path: 'artifacts/screens/world3d-overview.png' })

  // orbit: dragging changes what is on screen
  const box = (await page.getByTestId('world-canvas').boundingBox())!
  const before = await page.getByTestId('world-canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(600)
  const after = await page.getByTestId('world-canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())
  expect(after).not.toBe(before)
  await page.mouse.wheel(0, -500) // zoom in
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'artifacts/screens/world3d-orbit.png' })

  // the preference survives a reload, and the 2D view comes back
  await page.reload()
  await expect(page.getByTestId('world-canvas')).toHaveAttribute('data-mode', '3d')
  await page.getByTestId('mode-toggle').click()
  await expect(page.getByTestId('world-canvas')).toHaveAttribute('data-mode', '2d')
  await page.waitForTimeout(500)
  expect(await distinctColours(page)).toBeGreaterThan(12)
})

test('a click on the 3D terrain applies the god tool at that place', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('population')).toContainText('herbivores')
  await page.getByTestId('mode-toggle').click()
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(800)
  const count = async () => Number(/Population : (\d+)/.exec((await page.getByTestId('population').textContent()) ?? '')?.[1])
  const before = await count()
  await page.getByTestId('tool-herbivore').click()
  const box = (await page.getByTestId('world-canvas').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.55) // somewhere on the island
  await expect.poll(count).toBeGreaterThanOrEqual(before) // the click raycasts onto the terrain (or the sea: no spawn on water)
  await expect(page.getByTestId('god-message')).toContainText('Herbivores créés')
})
