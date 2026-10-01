import { writeFileSync } from 'node:fs'
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

  // left drag moves over the ground, right drag turns: each changes what is on screen
  const box = (await page.getByTestId('world-canvas').boundingBox())!
  const shot = () => page.getByTestId('world-canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())
  for (const button of ['left', 'right'] as const) {
    const before = await shot()
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6)
    await page.mouse.down({ button })
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 8 })
    await page.mouse.up({ button })
    await page.waitForTimeout(600)
    expect(await shot(), `${button} drag`).not.toBe(before)
  }
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

/**
 * Saves the canvas each time the running effect reaches one of the given effect times (virtual seconds). Effects
 * advance by frame time (capped), so on the software-WebGL renderer, which draws only a few frames per second,
 * they play in slow motion and a capture at a given effect time is reliable (unlike a real-time delay).
 */
async function grabAtEffectTimes(page: Page, times: number[], pathFor: (i: number) => string) {
  const urls = await page.getByTestId('world-canvas').evaluate(async (c: HTMLCanvasElement, wanted: number[]) => {
    const r = (window as unknown as { __lifeRenderer: { effects: { times: number[] } } }).__lifeRenderer
    const out: string[] = []
    const start = performance.now()
    while (out.length < wanted.length && performance.now() - start < 40_000) {
      const t = r.effects.times[0]
      if (t !== undefined && t >= wanted[out.length]!) out.push(c.toDataURL('image/png'))
      else await new Promise((res) => setTimeout(res, 20))
    }
    return out
  }, times)
  expect(urls.length).toBe(times.length) // every wanted moment was reached before the effect ended
  urls.forEach((u, i) => writeFileSync(pathFor(i), Buffer.from(u.split(',')[1]!, 'base64')))
}

/** Collects page errors and console errors (a broken shader only shows up there). */
function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  return errors
}

test('weather is visible in 3D: rain greys and darkens the world, drought turns it dusty', { tag: '@3d' }, async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto(SEED_URL)
  await expect(page.getByTestId('population')).toContainText('herbivores')
  await page.getByTestId('mode-toggle').click()
  // daylight first: jump to noon of day 1 (tick 300) so that the weather change is easy to see
  await page.getByRole('button', { name: 'Pause' }).click()
  await jumpForward(page, 300 - (await currentTick(page)))
  const mean = () =>
    page.getByTestId('world-canvas').evaluate((c: HTMLCanvasElement) => {
      const g = document.createElement('canvas')
      g.width = 64
      g.height = 36
      const ctx = g.getContext('2d')!
      ctx.drawImage(c, 0, 0, 64, 36)
      const d = ctx.getImageData(0, 0, 64, 36).data
      let r = 0
      let gr = 0
      let b = 0
      let sat = 0
      for (let i = 0; i < d.length; i += 4) {
        r += d[i]!
        gr += d[i + 1]!
        b += d[i + 2]!
        sat += (Math.max(d[i]!, d[i + 1]!, d[i + 2]!) - Math.min(d[i]!, d[i + 1]!, d[i + 2]!)) / (Math.max(d[i]!, d[i + 1]!, d[i + 2]!) + 1)
      }
      const n = d.length / 4
      return { r: r / n, g: gr / n, b: b / n, lum: (r + gr + b) / (3 * n), sat: sat / n }
    })
  const clear = await mean()

  await page.getByTestId('weather-rain').click()
  await expect(page.getByTestId('weather')).toContainText('Pluie')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'artifacts/screens/world3d-rain.png' })
  const rain = await mean()
  // measured: saturation 0.358 clear -> 0.308 in rain (the white streaks keep the mean luminance almost unchanged)
  expect(rain.sat).toBeLessThan(clear.sat * 0.93)

  await page.getByTestId('weather-drought').click()
  await expect(page.getByTestId('weather')).toContainText('Sécheresse')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'artifacts/screens/world3d-drought.png' })
  const dry = await mean()
  // measured: red/blue 0.81 clear -> 0.95 in a drought (dusty orange)
  expect(dry.r / dry.b).toBeGreaterThan((clear.r / clear.b) * 1.1)

  await page.getByTestId('weather-clear').click()
  expect(errors).toEqual([])
})

test('God powers have visible effects in 3D: a meteor falls and explodes, a blessing shines', { tag: '@3d' }, async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto(SEED_URL)
  await expect(page.getByTestId('population')).toContainText('herbivores')
  await page.getByTestId('mode-toggle').click()
  await page.getByRole('button', { name: 'Pause' }).click()
  await jumpForward(page, 300 - (await currentTick(page))) // daylight
  const box = (await page.getByTestId('world-canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height * 0.55
  const population = async () => Number(/Population : (\d+)/.exec((await page.getByTestId('population').textContent()) ?? '')?.[1])

  await page.getByTestId('tool-bless').click()
  await page.getByTestId('radius').fill('18')
  await page.mouse.click(cx, cy)
  await grabAtEffectTimes(page, [1.2], () => 'artifacts/screens/world3d-bless.png') // the column of light is brightest around 1.2 s
  await page.waitForTimeout(2500)

  await page.getByTestId('tool-meteor').click()
  await page.getByTestId('radius').fill('24')
  const before = await population()
  await page.mouse.click(cx, cy)
  // read right away (a screenshot takes a long time under software WebGL and would land after the impact)
  expect(await population()).toBe(before) // the fireball is still falling: nothing dies before the impact
  // the meteor lands at effect time 0.7 s: the fall, the flash + shock wave just after, then embers and scorched ground
  await grabAtEffectTimes(page, [0.35, 0.95, 1.8], (i) => `artifacts/screens/world3d-meteor-${['fall', 'impact', 'embers'][i]}.png`)
  await expect.poll(population, { timeout: 15_000 }).toBeLessThan(before)
  expect(errors).toEqual([])
})

test('visual effects can be turned off, and the choice is remembered', { tag: '@3d' }, async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto(SEED_URL)
  await expect(page.getByTestId('population')).toContainText('herbivores')
  await page.getByTestId('mode-toggle').click()
  await expect(page.getByTestId('world-canvas')).toHaveAttribute('data-effects', 'on')
  await page.getByTestId('menu-toggle').click()
  await page.getByTestId('effects-toggle').uncheck()
  await expect(page.getByTestId('world-canvas')).toHaveAttribute('data-effects', 'off')
  await page.waitForTimeout(800)
  // still a real picture without the bloom pass
  expect(await distinctColours(page)).toBeGreaterThan(12)
  await page.reload()
  await expect(page.getByTestId('world-canvas')).toHaveAttribute('data-effects', 'off')
  expect(errors).toEqual([])
})
