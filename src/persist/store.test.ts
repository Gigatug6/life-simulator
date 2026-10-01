import { describe, expect, it } from 'vitest'
import { MemoryStore, createSaveStore } from './store'

describe('MemoryStore', () => {
  it('saves, reloads (copies) and clears', async () => {
    const s = new MemoryStore()
    expect(await s.load()).toBeNull()
    const data = new Uint8Array([1, 2, 3])
    await s.save(data, { savedAt: 10, tick: 5, seed: 7 })
    data[0] = 99 // modifying the original must not change the saved copy
    const r = (await s.load())!
    expect(Array.from(r.data)).toEqual([1, 2, 3])
    expect(r.meta).toEqual({ savedAt: 10, tick: 5, seed: 7 })
    r.data[1] = 42
    expect((await s.load())!.data[1]).toBe(2)
    await s.clear()
    expect(await s.load()).toBeNull()
  })

  it('createSaveStore falls back to memory without IndexedDB (Node)', () => {
    expect(createSaveStore().persistent).toBe(false)
  })
})
