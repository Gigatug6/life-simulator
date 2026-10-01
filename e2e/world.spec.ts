import { expect, test } from '@playwright/test'

test('the world is displayed and the camera responds to the wheel', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('status')).toContainText('Moteur WASM prêt')
  await expect(page.getByTestId('population')).toContainText('herbivores')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'artifacts/screens/world-fit.png' })
  const box = (await page.getByTestId('world-canvas').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -600)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'artifacts/screens/world-zoom.png' })
  // the canvas is not empty: at least a few distinct colours
  const colors = await page.getByTestId('world-canvas').evaluate((c: HTMLCanvasElement) => {
    const g = document.createElement('canvas')
    g.width = 64
    g.height = 64
    const ctx = g.getContext('2d')!
    ctx.drawImage(c, 0, 0, 64, 64)
    const d = ctx.getImageData(0, 0, 64, 64).data
    const set = new Set<number>()
    for (let i = 0; i < d.length; i += 4) set.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!)
    return set.size
  })
  expect(colors).toBeGreaterThan(5)
})
