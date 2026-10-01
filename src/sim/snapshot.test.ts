import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { grassView, loadEngine } from './engine'
import { restoreSnapshot, takeSnapshot } from './snapshot'

const wasmPath = new URL('./wasm/life.wasm', import.meta.url)

describe.runIf(existsSync(wasmPath))('snapshot du monde', () => {
  it("aller-retour : la simulation reprend à l'identique", async () => {
    const a = await loadEngine(readFileSync(wasmPath))
    a.world_init(7, 96, 80)
    for (let i = 0; i < 300; i++) a.tick()
    a.world_set_rain(0.5)
    const snap = takeSnapshot(a)

    const b = await loadEngine(readFileSync(wasmPath))
    expect(restoreSnapshot(b, snap)).toBe(true)
    expect(b.world_tick()).toBe(300)
    expect(b.world_seed()).toBe(7)
    expect(b.world_rain()).toBeCloseTo(0.5)
    expect(takeSnapshot(b)).toEqual(snap)

    for (let i = 0; i < 200; i++) {
      a.tick()
      b.tick()
    }
    expect(grassView(b)).toEqual(grassView(a))
    expect(takeSnapshot(b)).toEqual(takeSnapshot(a))
  })

  it('refuse les données invalides', async () => {
    const e = await loadEngine(readFileSync(wasmPath))
    expect(restoreSnapshot(e, new Uint8Array(10))).toBe(false)
    const bad = new Uint8Array(64)
    expect(restoreSnapshot(e, bad)).toBe(false)
    e.world_init(1, 16, 16)
    const snap = takeSnapshot(e)
    expect(restoreSnapshot(e, snap.subarray(0, snap.length - 1))).toBe(false)
  })
})
