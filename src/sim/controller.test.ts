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
})
