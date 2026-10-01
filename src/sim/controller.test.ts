import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { creatureView, loadEngine } from './engine'
import { describeBrain } from './brain'
import { SimController, GRASS_EVERY } from './controller'

const wasmPath = new URL('./wasm/life.wasm', import.meta.url)

describe.runIf(existsSync(wasmPath))('SimController', () => {
  const make = async () => {
    const sim = new SimController(await loadEngine(readFileSync(wasmPath)))
    sim.init(5, 128, 128, 150, 10)
    return sim
  }

  it('populates the world and exposes a consistent terrain + frame', async () => {
    const sim = await make()
    const t = sim.terrain()
    expect(t.biome.length).toBe(128 * 128)
    expect(t.altitude.length).toBe(128 * 128) // the 3D view needs the relief
    expect(t.altitude.every((v) => v >= 0 && v <= 1)).toBe(true)
    const f = sim.frame()
    expect(f.herbivores).toBe(150)
    expect(f.carnivores).toBe(10)
    expect(f.count).toBe(160)
    expect(f.x.length).toBe(160)
    expect(f.species.length).toBe(160)
    expect(f.grass?.length).toBe(128 * 128) // first frame: grass included
    expect(sim.frame().grass).toBeNull()
  })

  it("respects the speed and the time budget", async () => {
    const sim = await make()
    sim.speed = 0
    expect(sim.advance(50)).toBe(0)
    sim.speed = 16
    expect(sim.advance(1000)).toBe(16)
    expect(sim.frame().tick).toBe(16)
    // budget exhausted immediately: at least 1 tick, then stop
    let t = 0
    const clock = () => (t += 100)
    sim.speed = 64
    expect(sim.advance(10, clock)).toBe(1)
  })

  it('applies spawn and rain, grass comes back periodically', async () => {
    const sim = await make()
    const before = sim.frame().count
    sim.spawn(60, 60, 0, 5)
    expect(sim.frame().count).toBe(before + 5)
    sim.rain(1)
    expect(sim.engine.world_rain()).toBe(1)
    let withGrass = 0
    for (let i = 0; i < GRASS_EVERY * 2; i++) if (sim.frame().grass) withGrass++
    expect(withGrass).toBe(2)
  })

  it('snapshot then restore reproduces the same world (same ticks, same creatures)', async () => {
    const a = await make()
    a.speed = 16
    for (let i = 0; i < 5; i++) a.advance(1000)
    const { data, meta } = a.snapshot()
    expect(meta).toEqual({ tick: 80, seed: 5 })
    const b = new SimController(await loadEngine(readFileSync(wasmPath)))
    expect(b.restore(data)).toBe(true)
    expect(b.frame().tick).toBe(80)
    expect(b.frame().count).toBe(a.frame().count)
    expect(b.restore(new Uint8Array(5))).toBe(false)
  })

  it('catches up elapsed time in a burst, capped, interruptible', async () => {
    const sim = await make()
    expect(sim.beginCatchup(10_000)).toBe(300) // 10 s × 30 ticks/s
    let steps = 0
    let last = { done: 0, total: 0, finished: false }
    while (!last.finished && steps++ < 1000) last = sim.stepCatchup(5)
    expect(last).toMatchObject({ done: 300, total: 300, finished: true })
    expect(sim.frame().tick).toBe(300)
    expect(sim.catchingUp).toBe(false)
    // tick cap
    expect(sim.beginCatchup(10 * 24 * 3600 * 1000)).toBe(300_000)
    // "skip"
    sim.skipCatchup()
    expect(sim.catchingUp).toBe(false)
    expect(sim.beginCatchup(0)).toBe(0)
    // compute-time cap: simulated clock that advances 100 s on every read
    let t = 0
    sim.beginCatchup(3600_000, () => (t += 100_000))
    expect(sim.stepCatchup(5, () => (t += 100_000)).finished).toBe(true)
  })

  it('meteor, blessing and drought', async () => {
    const sim = await make()
    const total = sim.frame().count
    expect(sim.meteor(64, 64, 200)).toBe(total) // radius covering the whole world
    expect(sim.frame().count).toBe(0)
    sim.spawn(60, 60, 0, 3)
    sim.engine.creature_spawn(10, 10, 0)
    expect(sim.bless(60, 60, 5)).toBeGreaterThan(0)
    sim.rain(-1)
    expect(sim.engine.world_rain()).toBe(-1)
    sim.rain(-5) // clamped
    expect(sim.engine.world_rain()).toBe(-1)
  })

  it("follows a creature (inspector) until its death", async () => {
    const sim = await make()
    const f = sim.frame()
    expect(f.selected).toBeNull()
    sim.selectedId = f.id[3]!
    const s = sim.frame().selected!
    expect(s.id).toBe(f.id[3])
    expect(s.x).toBe(f.x[3])
    expect(s.genome.length).toBe(258)
    expect(s.hidden).toBe(4) // initial genome: 4 hidden neurons
    expect(s.traits.size).toBeCloseTo(f.size[3]!)
    expect(s.traits.hue).toBeCloseTo(f.hue[3]!)
    expect(f.size.length).toBe(f.count)
    expect(f.signal.length).toBe(f.count)
    expect(s.signal).toBeCloseTo(f.signal[3]!)
    expect(describeBrain(s.genome).kinds.every((k) => k === 0)).toBe(true) // founders: all tanh
    expect(describeBrain(s.genome).w1[0]!.length).toBe(14) // 14 inputs
    expect(describeBrain(s.genome).w2.length).toBe(5) // 5 outputs
    expect(f.hue.length).toBe(f.count)
    const brain = describeBrain(s.genome)
    expect(brain.hidden).toBe(4)
    expect(brain.w1.length).toBe(4)
    expect(brain.w1[0]!.length).toBe(14)
    expect(brain.w2.length).toBe(5)
    expect(brain.w2[0]!.length).toBe(4)
    sim.meteor(64, 64, 200)
    expect(sim.frame().selected).toBeNull()
  })

  it("creatures learn during their life (non-zero learned deltas)", async () => {
    const sim = await make()
    expect(creatureView(sim.engine, 'learned').every((v) => v === 0)).toBe(true)
    sim.speed = 64
    for (let i = 0; i < 6; i++) sim.advance(1000)
    const learned = creatureView(sim.engine, 'learned')
    expect(learned.some((v) => v !== 0)).toBe(true)
    expect(learned.every((v) => Math.abs(v) <= 2)).toBe(true)
  })

  it("provides a 0-100 intelligence index (null if the species is absent)", async () => {
    const sim = await make()
    const f = sim.frame()
    expect(f.iqHerbivores).not.toBeNull()
    expect(f.iqHerbivores!).toBeGreaterThanOrEqual(0)
    expect(f.iqHerbivores!).toBeLessThanOrEqual(100)
    expect(f.iqCarnivores).not.toBeNull()
    // mean herbivore body plan: founders are within ±10 % of the default plan
    expect(f.bodyHerbivores).not.toBeNull()
    // founders only have classic neurons: every non-classic share is zero
    expect(f.kindsHerbivores).toEqual({ bump: 0, step: 0, wave: 0 })
    for (const v of [f.bodyHerbivores!.size, f.bodyHerbivores!.speed, f.bodyHerbivores!.vision]) expect(Math.abs(v - 1)).toBeLessThan(0.1)
    sim.engine.world_init(5, 64, 64)
    sim.engine.world_populate(0, 20)
    const g = new SimController(sim.engine).frame()
    expect(g.iqCarnivores).toBeNull()
    sim.engine.world_meteor(32, 32, 500)
    expect(new SimController(sim.engine).frame().bodyHerbivores).toBeNull() // nobody left
    expect(new SimController(sim.engine).frame().kindsHerbivores).toBeNull()
  })
})
