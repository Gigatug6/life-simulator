import { expect, test, type Page } from '@playwright/test'

// a fixed world whose centre (where the 3D camera looks) is land with some forest: the tests do not depend on luck
const SEED_URL = '/?seed=13'

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

/**
 * Jumps the world forward by `ticks` through the offline catch-up (30 ticks per real second): the save is
 * aged by ticks/30 s and the page reloaded. Deterministic, unlike steering the clock with speed buttons
 * (each click and poll costs seconds under software WebGL, during which the clock runs far ahead).
 * The pause is remembered across the reload, so the world comes back frozen.
 */
async function jumpForward(page: Page, ticks: number) {
  await page.getByTestId('menu-toggle').click()
  await page.getByRole('menuitem', { name: 'Sauvegarder' }).click()
  await expect(page.getByTestId('saved')).toContainText('Sauvegardé à')
  await page.evaluate(async (ageMs: number) => {
    const path = '/src/persist/store.ts'
    const { createSaveStore } = (await import(/* @vite-ignore */ path)) as typeof import('../src/persist/store')
    const store = createSaveStore()
    const rec = (await store.load())!
    await store.save(rec.data, { ...rec.meta, savedAt: rec.meta.savedAt - ageMs })
  }, (ticks / 30) * 1000)
  await page.reload()
  await expect(page.getByTestId('status')).toContainText('Monde repris')
  await expect(page.getByTestId('catchup')).toHaveCount(0, { timeout: 60_000 })
  await expect(page.getByRole('button', { name: 'Pause' })).toBeDisabled() // = the active speed
  await expect(page.getByTestId('world-canvas')).toHaveAttribute('data-mode', '3d')
  await page.waitForTimeout(1500)
}

const currentTick = async (page: Page) => Number(/Tick : (\d+)/.exec((await page.getByTestId('ticks').textContent()) ?? '')?.[1])

test('the 3D view shows the relief, can orbit, and switches back to 2D', { tag: '@3d' }, async ({ page }) => {
  await page.goto(SEED_URL)
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
  // two speeds: each click and poll costs time (a lot under load), during which the clock keeps running
  await page.getByRole('button', { name: '×4' }).click()
  for (let i = 0; i < 1000 && (await tick()) < 150; i++) await page.waitForTimeout(30)
  await page.getByRole('button', { name: '×1' , exact: true }).click()
  for (let i = 0; i < 1000 && (await tick()) < 260; i++) await page.waitForTimeout(25)
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

test('a click on the 3D terrain applies the god tool at that place', { tag: '@3d' }, async ({ page }) => {
  await page.goto(SEED_URL)
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

test('creatures have bodies in 3D, can be approached and inspected with a click', { tag: '@3d' }, async ({ page }) => {
  await page.goto(SEED_URL)
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
  const population = async () => Number(/Population : (\d+)/.exec((await page.getByTestId('population').textContent()) ?? '')?.[1])
  const before = await population()
  await page.getByTestId('tool-herbivore').click()
  await page.mouse.click(cx, cy)
  await page.mouse.click(cx, cy)
  await page.mouse.click(cx, cy)
  // wait until the frame holding the herd has reached the UI (software WebGL can delay the message queue):
  // the picking reads that same frame, so inspecting earlier would find nobody
  await expect.poll(population, { timeout: 20_000 }).toBeGreaterThanOrEqual(before + 30)
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

test('the 3D decor follows the seasons: orange foliage in autumn, snow in winter', { tag: '@3d' }, async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(SEED_URL)
  await expect(page.getByTestId('population')).toContainText('herbivores')
  await page.getByTestId('mode-toggle').click()
  await expect(page.getByTestId('world-canvas')).toHaveAttribute('data-mode', '3d')
  const tick = async () => Number(/Tick : (\d+)/.exec((await page.getByTestId('ticks').textContent()) ?? '')?.[1])

  // share of the pixels of the central area matching a colour test, measured on the WebGL canvas
  const share = (which: 'orange' | 'white') =>
    page.getByTestId('world-canvas').evaluate((c: HTMLCanvasElement, kind: string) => {
      const W = 160
      const H = 90
      const g = document.createElement('canvas')
      g.width = W
      g.height = H
      const ctx = g.getContext('2d')!
      ctx.drawImage(c, 0, 0, W, H)
      const d = ctx.getImageData(Math.floor(W * 0.3), Math.floor(H * 0.45), Math.floor(W * 0.4), Math.floor(H * 0.45)).data
      let hits = 0
      for (let i = 0; i < d.length; i += 4) {
        const [r, gr, b] = [d[i]!, d[i + 1]!, d[i + 2]!]
        const orange = r > 120 && r - gr > 25 && gr - b > 15 && gr > 50
        // snow: bright and nearly colourless (shaded snow is grey-blue, not pure white); sand and sea are saturated
        const lo = Math.min(r, gr, b)
        const white = lo > 140 && Math.max(r, gr, b) - lo < 45
        if (kind === 'orange' ? orange : white) hits++
      }
      return hits / (d.length / 4)
    }, which)

  await page.getByRole('button', { name: 'Pause' }).click()
  const spring = { orange: await share('orange'), white: await share('white') } // tick ~0: green decor, night

  // mid-autumn; the catch-up also counts the real seconds of the reload (~30 ticks each), the world is frozen after
  await jumpForward(page, 4500 - (await tick())) // 4500 % 600 = 300: noon
  expect(await tick()).toBeGreaterThanOrEqual(4500)
  expect(await tick()).toBeLessThan(4600) // 4600 % 600 = 400: still daylight
  await page.screenshot({ path: 'artifacts/screens/world3d-autumn.png' })
  const autumn = { orange: await share('orange'), white: await share('white') }
  expect(autumn.orange).toBeGreaterThan(Math.max(0.01, spring.orange * 3)) // the foliage and fields turned orange

  await jumpForward(page, 6300 - (await tick())) // mid-winter (tick 6300), noon
  expect(await tick()).toBeGreaterThanOrEqual(6300)
  expect(await tick()).toBeLessThan(6400)
  await page.screenshot({ path: 'artifacts/screens/world3d-winter.png' })
  const winter = { orange: await share('orange'), white: await share('white') }
  expect(winter.white).toBeGreaterThan(Math.max(0.02, spring.white * 3)) // snow on the heights, pale foliage
  expect(winter.orange).toBeLessThan(autumn.orange) // the autumn colours are gone
})

test('at night the 3D world glows: fireflies between the trees, bioluminescent creatures, bloom', { tag: '@3d' }, async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(SEED_URL)
  await expect(page.getByTestId('population')).toContainText('herbivores')
  await page.getByTestId('mode-toggle').click()
  await page.getByRole('button', { name: 'Pause' }).click()
  // midnight (4800 % 600 = 0) in a world that has had thousands of ticks to evolve its lights
  await jumpForward(page, 4800 - (await currentTick(page)))
  const t = await currentTick(page)
  expect(t).toBeGreaterThanOrEqual(4800)
  expect(t).toBeLessThan(4900) // still the dead of night
  await page.screenshot({ path: 'artifacts/screens/world3d-night-glow.png' })

  // bright, warm-green dots on a dark background: the fireflies and the glows (a night without any is black)
  const lit = await page.getByTestId('world-canvas').evaluate((c: HTMLCanvasElement) => {
    const g = document.createElement('canvas')
    g.width = 320
    g.height = 180
    const ctx = g.getContext('2d')!
    ctx.drawImage(c, 0, 0, 320, 180)
    const d = ctx.getImageData(0, 0, 320, 180).data
    let hits = 0
    for (let i = 0; i < d.length; i += 4) if (d[i + 1]! > 170 && d[i]! > 110 && d[i + 2]! < 200) hits++
    return hits
  })
  expect(lit).toBeGreaterThan(8)

  // closer look
  const box = (await page.getByTestId('world-canvas').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -600)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'artifacts/screens/world3d-night-closeup.png' })
})
