import { describe, expect, it } from 'vitest'
import { MemoryStore, createSaveStore } from './store'

describe('MemoryStore', () => {
  it('sauvegarde, recharge (copies) et efface', async () => {
    const s = new MemoryStore()
    expect(await s.load()).toBeNull()
    const data = new Uint8Array([1, 2, 3])
    await s.save(data, { savedAt: 10, tick: 5, seed: 7 })
    data[0] = 99 // modifier l'original ne doit pas changer la sauvegarde
    const r = (await s.load())!
    expect(Array.from(r.data)).toEqual([1, 2, 3])
    expect(r.meta).toEqual({ savedAt: 10, tick: 5, seed: 7 })
    r.data[1] = 42
    expect((await s.load())!.data[1]).toBe(2)
    await s.clear()
    expect(await s.load()).toBeNull()
  })

  it('createSaveStore se replie sur la mémoire sans IndexedDB (Node)', () => {
    expect(createSaveStore().persistent).toBe(false)
  })
})
