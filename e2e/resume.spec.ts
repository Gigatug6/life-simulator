import { expect, test } from '@playwright/test'

const openMenu = async (page: import('@playwright/test').Page) => {
  if (!(await page.getByTestId('menu').isVisible())) await page.getByTestId('menu-toggle').click()
}

const tickOf = async (page: import('@playwright/test').Page) =>
  Number(/Tick : (\d+)/.exec((await page.getByTestId('ticks').textContent()) ?? '')?.[1])

test('recharger la page reprend le même monde depuis le cache du navigateur', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('status')).toContainText('Moteur WASM prêt')
  await page.getByRole('button', { name: '×16' }).click()
  await expect.poll(() => tickOf(page)).toBeGreaterThan(200)
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(200)
  const before = await tickOf(page)
  await page.getByTestId('menu-toggle').click()
  await page.getByRole('menuitem', { name: 'Sauvegarder' }).click()
  await expect(page.getByTestId('saved')).toContainText('Sauvegardé à')

  await page.reload()
  await expect(page.getByTestId('status')).toContainText('Monde repris')
  await expect.poll(() => tickOf(page)).toBeGreaterThanOrEqual(before)
  expect(await tickOf(page)).toBeLessThan(before + 200) // pas un nouveau monde à 0, ni un bond
})

test('un monde sauvegardé il y a longtemps est rattrapé en rafale à la reprise', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('status')).toContainText('Moteur WASM prêt')
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.getByTestId('menu-toggle').click()
  await page.getByRole('menuitem', { name: 'Sauvegarder' }).click()
  await expect(page.getByTestId('saved')).toContainText('Sauvegardé à')
  // vieillit la sauvegarde de 20 s (≈ 600 ticks à rattraper)
  await page.evaluate(async () => {
    const path = '/src/persist/store.ts'
    const { createSaveStore } = (await import(/* @vite-ignore */ path)) as typeof import('../src/persist/store')
    const store = createSaveStore()
    const rec = (await store.load())!
    await store.save(rec.data, { ...rec.meta, savedAt: rec.meta.savedAt - 20_000 })
  })
  await page.reload()
  await expect(page.getByTestId('status')).toContainText('Monde repris')
  // le monde a avancé d'au moins ~500 ticks sans que l'on ait attendu
  await expect.poll(() => tickOf(page), { timeout: 20_000 }).toBeGreaterThan(500)
})

test('exporter, créer un nouveau monde puis réimporter le fichier retrouve le monde', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await expect(page.getByTestId('status')).toContainText('Moteur WASM prêt')
  await page.getByRole('button', { name: '×16' }).click()
  await expect.poll(() => tickOf(page)).toBeGreaterThan(300)
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(200)
  const exportedTick = await tickOf(page)

  const [download] = await Promise.all([page.waitForEvent('download'), openMenu(page).then(() => page.getByTestId('export').click())])
  expect(download.suggestedFilename()).toMatch(/^monde-[0-9a-f]+-t\d+\.life$/)
  const path = await download.path()

  await openMenu(page)
  await page.getByTestId('new-world').click()
  // le monde est remplacé (la boîte de confirmation est traitée de façon asynchrone)
  await expect.poll(() => tickOf(page)).toBeLessThan(exportedTick)

  await openMenu(page)
  await page.getByTestId('import-input').setInputFiles(path)
  await expect(page.getByTestId('status')).toContainText('Monde repris')
  await expect.poll(() => tickOf(page)).toBeGreaterThanOrEqual(exportedTick)
  await expect(page.getByTestId('save-error')).toHaveCount(0)

  await openMenu(page)
  // un fichier invalide est refusé sans casser le monde
  await page.getByTestId('import-input').setInputFiles({ name: 'x.life', mimeType: 'application/octet-stream', buffer: Buffer.from('nimportequoi') })
  await expect(page.getByTestId('save-error')).toContainText('pas une sauvegarde valide')
})

test("deux démarrages simultanés ne créent qu'un seul monde actif", async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await expect(page.getByTestId('population')).toContainText('herbivores')
  await openMenu(page)
  // deux « Nouveau monde » dans la MÊME tâche JavaScript : les deux démarrages se chevauchent
  await page.getByTestId('new-world').evaluate((el: HTMLElement) => {
    el.click()
    el.click()
  })
  await expect(page.getByTestId('population')).toContainText('herbivores')
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(500)
  // en pause, aucun worker « fantôme » ne doit encore faire avancer un monde
  const seen = new Set<number>()
  for (let i = 0; i < 8; i++) {
    seen.add(await tickOf(page))
    await page.waitForTimeout(120)
  }
  expect([...seen].length).toBe(1)
})
