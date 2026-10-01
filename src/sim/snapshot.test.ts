import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { creatureView, grassView, loadEngine } from './engine'
import { restoreSnapshot, snapshotInfo, takeSnapshot } from './snapshot'

const wasmPath = new URL('./wasm/life.wasm', import.meta.url)

describe.runIf(existsSync(wasmPath))('world snapshot', () => {
  it("round trip: the simulation resumes identically", async () => {
    const a = await loadEngine(readFileSync(wasmPath))
    a.world_init(7, 96, 80)
    for (let i = 0; i < 300; i++) a.tick()
    a.creature_spawn(10.5, 20.25, 0)
    a.creature_spawn(30, 40, 1)
    a.creature_spawn(50, 60, 0)
    a.creature_kill(0)
    a.world_set_rain(0.5)
    const snap = takeSnapshot(a)

    const b = await loadEngine(readFileSync(wasmPath))
    expect(restoreSnapshot(b, snap)).toBe(true)
    expect(b.world_tick()).toBe(300)
    expect(b.world_seed()).toBe(7)
    expect(b.world_rain()).toBeCloseTo(0.5)
    expect(takeSnapshot(b)).toEqual(snap)
    // (the empty world was repopulated by the rebirth during the 300 ticks: compare with the original)
    expect(b.creature_count()).toBe(a.creature_count())
    expect(creatureView(b, 'species')).toEqual(creatureView(a, 'species'))
    expect(creatureView(b, 'x')).toEqual(creatureView(a, 'x'))
    expect(b.creature_next_id()).toBe(a.creature_next_id())
    expect(creatureView(b, 'genome')).toEqual(creatureView(a, 'genome'))
    expect(creatureView(b, 'learned')).toEqual(creatureView(a, 'learned'))
    expect(creatureView(b, 'traits')).toEqual(creatureView(a, 'traits'))
    expect(creatureView(b, 'memory')).toEqual(creatureView(a, 'memory'))
    expect(creatureView(b, 'signal')).toEqual(creatureView(a, 'signal'))
    expect(b.elite_count()).toBe(a.elite_count())
    expect(b.world_rescues()).toBe(a.world_rescues())
    expect(b.rng_lo()).toBe(a.rng_lo())
    expect(b.rng_hi()).toBe(a.rng_hi())

    for (let i = 0; i < 200; i++) {
      a.tick()
      b.tick()
    }
    expect(grassView(b)).toEqual(grassView(a))
    expect(takeSnapshot(b)).toEqual(takeSnapshot(a))
  })

  it('rejects invalid data', async () => {
    const e = await loadEngine(readFileSync(wasmPath))
    expect(restoreSnapshot(e, new Uint8Array(10))).toBe(false)
    const bad = new Uint8Array(64)
    expect(restoreSnapshot(e, bad)).toBe(false)
    e.world_init(1, 16, 16)
    const snap = takeSnapshot(e)
    expect(restoreSnapshot(e, snap.subarray(0, snap.length - 1))).toBe(false)
  })

  it('the creature simulation resumes identically after restoring', async () => {
    const a = await loadEngine(readFileSync(wasmPath))
    a.world_init(21, 128, 128)
    let placed = 0
    for (let k = 0; placed < 200 && k < 5000; k++) {
      if (a.creature_spawn((k * 37) % 128, (k * 91) % 128, 0) >= 0) placed++
    }
    for (let i = 0; i < 150; i++) a.tick()
    const snap = takeSnapshot(a)
    const b = await loadEngine(readFileSync(wasmPath))
    expect(restoreSnapshot(b, snap)).toBe(true)
    for (let i = 0; i < 150; i++) {
      a.tick()
      b.tick()
    }
    expect(takeSnapshot(b)).toEqual(takeSnapshot(a))
    expect(a.creature_count()).toBeGreaterThan(0)
  })

  it("reads a snapshot header and rejects invalid files", async () => {
    const e = await loadEngine(readFileSync(wasmPath))
    e.world_init(9, 64, 48)
    e.creature_spawn(5, 5, 0)
    for (let i = 0; i < 12; i++) e.tick()
    const snap = takeSnapshot(e)
    expect(snapshotInfo(snap)).toEqual({ seed: 9, tick: 12, w: 64, h: 48, creatures: e.creature_count() })
    expect(snapshotInfo(snap.subarray(0, snap.length - 3))).toBeNull()
    expect(snapshotInfo(new Uint8Array(100))).toBeNull()
    const bad = snap.slice()
    bad[0] ^= 0xff
    expect(snapshotInfo(bad)).toBeNull()
  })
})
