import { expect, test } from '@playwright/test'

test('IndexedDB : sauvegarde, rechargement et effacement réels', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    // import dynamique via le serveur de dev (chemin en variable : pas de résolution TypeScript)
    const path = '/src/persist/store.ts'
    const { createSaveStore } = (await import(/* @vite-ignore */ path)) as typeof import('../src/persist/store')
    const store = createSaveStore()
    await store.clear()
    const before = await store.load()
    await store.save(new Uint8Array([7, 8, 9]), { savedAt: 123, tick: 4, seed: 5 })
    const after = await store.load()
    await store.clear()
    return { persistent: store.persistent, before, data: after ? Array.from(after.data) : null, meta: after?.meta, cleared: await store.load() }
  })
  expect(result.persistent).toBe(true)
  expect(result.before).toBeNull()
  expect(result.data).toEqual([7, 8, 9])
  expect(result.meta).toEqual({ savedAt: 123, tick: 4, seed: 5 })
  expect(result.cleared).toBeNull()
})
