import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Biome, GENOME_LEN, altitudeView, biomeView, creatureView, grassView, loadEngine } from './engine'

const wasmPath = new URL('./wasm/life.wasm', import.meta.url)

describe.runIf(existsSync(wasmPath))('moteur WASM', () => {
  it('charge le module et répond', async () => {
    const e = await loadEngine(readFileSync(wasmPath))
    expect(e.version()).toBe(1)
    expect(e.add(2, 3)).toBe(5)
    expect(e.tick()).toBe(1)
    expect(e.tick()).toBe(2)
  })

  it('génère un monde déterministe avec eau et terre', async () => {
    const e = await loadEngine(readFileSync(wasmPath))
    expect(e.world_init(1, 0, 10)).toBe(1)
    expect(e.world_init(42, 128, 128)).toBe(0)
    const first = biomeView(e).slice()
    expect(first.length).toBe(128 * 128)
    expect(first).toContain(Biome.DeepWater)
    expect(first).toContain(Biome.Plain)
    expect(altitudeView(e).every((v) => v >= 0 && v <= 1)).toBe(true)
    e.world_init(42, 128, 128)
    expect(biomeView(e)).toEqual(first)
    e.world_init(43, 128, 128)
    expect(biomeView(e)).not.toEqual(first)
  })

  it("fait pousser l'herbe, seulement sur la terre, plus vite sous la pluie", async () => {
    const run = async (rain: number) => {
      const e = await loadEngine(readFileSync(wasmPath))
      e.world_init(42, 64, 64)
      const sum = () => grassView(e).reduce((a, b) => a + b, 0)
      const before = sum()
      for (let i = 0; i < 1500; i++) {
        if (rain && i % 100 === 0) e.world_set_rain(rain)
        e.tick()
      }
      const biome = biomeView(e)
      const grass = grassView(e)
      for (let i = 0; i < grass.length; i++) if (biome[i] <= Biome.ShallowWater) expect(grass[i]).toBe(0)
      return { before, after: sum(), season: e.world_season() }
    }
    const dry = await run(0)
    const wet = await run(1)
    expect(dry.after).toBeGreaterThan(dry.before)
    expect(wet.after).toBeGreaterThan(dry.after)
    expect(dry.season).toBe(0)
  })

  it('gère les créatures (spawn, kill par échange, id stables)', async () => {
    const e = await loadEngine(readFileSync(wasmPath))
    e.world_init(1, 32, 32)
    expect(e.creature_spawn(1, 2, 0)).toBe(0)
    expect(e.creature_spawn(3, 4, 1)).toBe(1)
    expect(e.creature_count()).toBe(2)
    const ids = Array.from(creatureView(e, 'id'))
    expect(new Set(ids).size).toBe(2)
    expect(e.genome_len()).toBe(GENOME_LEN)
    expect(creatureView(e, 'genome').length).toBe(2 * GENOME_LEN)
    const g1 = creatureView(e, 'genome').slice(GENOME_LEN)
    e.creature_kill(0)
    expect(creatureView(e, 'genome')).toEqual(g1) // le génome suit la créature échangée
    expect(e.creature_count()).toBe(1)
    expect(creatureView(e, 'id')[0]).toBe(ids[1])
    expect(creatureView(e, 'x')[0]).toBe(3)
    e.world_init(1, 32, 32)
    expect(e.creature_count()).toBe(0)
  })

  it('expose des statistiques par espèce', async () => {
    const e = await loadEngine(readFileSync(wasmPath))
    e.world_init(2, 64, 64)
    e.creature_spawn(10, 10, 0)
    e.creature_spawn(11, 10, 0)
    e.creature_spawn(12, 10, 1)
    expect(e.stats_count(0)).toBe(2)
    expect(e.stats_count(1)).toBe(1)
    expect(e.stats_mean_hidden(0)).toBe(4)
    expect(e.stats_mean_hidden(1)).toBe(4)
  })
})
