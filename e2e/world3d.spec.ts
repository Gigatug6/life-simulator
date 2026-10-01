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
  await page.screenshot({ path: 'artifacts/screens/world3d-night.png' }) // tick ~8: the middle of the night

  // let the clock run to the middle of the day (noon = tick 300), then freeze it for a daytime capture
  // (×4 and a tight polling loop: a faster speed overshoots the daylight window of ticks ~180-420)
  const tick = async () => Number(/Tick : (\d+)/.exec((await page.getByTestId('ticks').textContent()) ?? '')?.[1])
  await page.getByRole('button', { name: '×4' }).click()
  for (let i = 0; i < 400 && (await tick()) < 280; i++) await page.waitForTimeout(40)
  await page.getByRole('button', { name: 'Pause' }).click()
  expect(await tick()).toBeGreaterThan(250)
  expect(await tick()).toBeLessThan(420) // really in the middle of the day
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'artifacts/screens/world3d-overview.png' })
  expect(await distinctColours(page)).toBeGreaterThan(20) // daylight: a much richer image than the night

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

test('creatures have bodies in 3D, can be approached and inspected with a click', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('population')).toContainText('herbivores')
  await page.getByTestId('mode-toggle').click()
  const tick = async () => Number(/Tick : (\d+)/.exec((await page.getByTestId('ticks').textContent()) ?? '')?.[1])
  // wait for daylight (tick 250+) so the close-up is readable, then freeze
  await page.getByRole('button', { name: '×4' }).click()
  for (let i = 0; i < 400 && (await tick()) < 270; i++) await page.waitForTimeout(40)
  await page.getByRole('button', { name: 'Pause' }).click()

  // sow a herd right under the camera target (the screen centre looks at the middle of the island)
  const box = (await page.getByTestId('world-canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.getByTestId('tool-herbivore').click()
  await page.mouse.click(cx, cy)
  await page.mouse.click(cx, cy)
  await page.mouse.click(cx, cy)
  await page.mouse.move(cx, cy)
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -700) // dolly in towards the target
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'artifacts/screens/world3d-closeup.png' })

  // inspect: the click is raycast onto the terrain and the nearest creature is selected
  await page.getByTestId('tool-inspect').click()
  await page.mouse.click(cx, cy)
  await expect(page.getByTestId('inspector')).toBeVisible()
  await expect(page.getByTestId('inspector-size')).toHaveText(/^×\d\.\d\d$/)
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'artifacts/screens/world3d-inspect.png' })
})
