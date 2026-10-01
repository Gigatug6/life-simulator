import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadEngine } from './engine'
import { SimController, GRASS_EVERY } from './controller'

const wasmPath = new URL('./wasm/life.wasm', import.meta.url)

describe.runIf(existsSync(wasmPath))('SimController', () => {
  const make = async () => {
    const sim = new SimController(await loadEngine(readFileSync(wasmPath)))
    sim.init(5, 128, 128, 150, 10)
    return sim
  }

  it('peuple le monde et expose terrain + image cohérents', async () => {
    const sim = await make()
    const t = sim.terrain()
    expect(t.biome.length).toBe(128 * 128)
    const f = sim.frame()
    expect(f.herbivores).toBe(150)
    expect(f.carnivores).toBe(10)
    expect(f.count).toBe(160)
    expect(f.x.length).toBe(160)
    expect(f.species.length).toBe(160)
    expect(f.grass?.length).toBe(128 * 128) // première image : herbe incluse
    expect(sim.frame().grass).toBeNull()
  })

  it("respecte la vitesse et le budget de temps", async () => {
    const sim = await make()
    sim.speed = 0
    expect(sim.advance(50)).toBe(0)
    sim.speed = 16
    expect(sim.advance(1000)).toBe(16)
    expect(sim.frame().tick).toBe(16)
    // budget épuisé immédiatement : au moins 1 tick, puis arrêt
    let t = 0
    const clock = () => (t += 100)
    sim.speed = 64
    expect(sim.advance(10, clock)).toBe(1)
  })

  it('applique spawn et pluie, grass revient périodiquement', async () => {
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

  it('snapshot puis restore reproduit le même monde (même ticks, mêmes créatures)', async () => {
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

  it('rattrape le temps écoulé en rafale, plafonné, interruptible', async () => {
    const sim = await make()
    expect(sim.beginCatchup(10_000)).toBe(300) // 10 s × 30 ticks/s
    let steps = 0
    let last = { done: 0, total: 0, finished: false }
    while (!last.finished && steps++ < 1000) last = sim.stepCatchup(5)
    expect(last).toMatchObject({ done: 300, total: 300, finished: true })
    expect(sim.frame().tick).toBe(300)
    expect(sim.catchingUp).toBe(false)
    // plafond de ticks
    expect(sim.beginCatchup(10 * 24 * 3600 * 1000)).toBe(300_000)
    // « passer »
    sim.skipCatchup()
    expect(sim.catchingUp).toBe(false)
    expect(sim.beginCatchup(0)).toBe(0)
    // plafond de temps de calcul : horloge simulée qui avance de 100 s à chaque lecture
    let t = 0
    sim.beginCatchup(3600_000, () => (t += 100_000))
    expect(sim.stepCatchup(5, () => (t += 100_000)).finished).toBe(true)
  })
})
