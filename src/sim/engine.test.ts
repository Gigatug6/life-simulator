import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRAIN_IN, BRAIN_OUT } from './brain'
import { Biome, ELITE_SLOTS, GENOME_LEN, LEARN_LEN, MEM_LEN, TRAIT_LEN, Trait, altitudeView, biomeView, creatureView, grassView, loadEngine } from './engine'

const wasmPath = new URL('./wasm/life.wasm', import.meta.url)

describe.runIf(existsSync(wasmPath))('WASM engine', () => {
  it('loads the module and responds', async () => {
    const e = await loadEngine(readFileSync(wasmPath))
    expect(e.version()).toBe(1)
    expect(e.add(2, 3)).toBe(5)
    expect(e.tick()).toBe(1)
    expect(e.tick()).toBe(2)
  })

  it('generates a deterministic world with water and land', async () => {
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

  it("grows grass, only on land, faster under rain", async () => {
    const run = async (rain: number) => {
      const e = await loadEngine(readFileSync(wasmPath))
      e.world_init(42, 64, 64)
      const sum = () => grassView(e).reduce((a, b) => a + b, 0)
      const before = sum()
      // 450 ticks: before the first rebirth check (tick 500), which would put grazers in this empty world
      for (let i = 0; i < 450; i++) {
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

  it('manages creatures (spawn, swap-kill, stable ids)', async () => {
    const e = await loadEngine(readFileSync(wasmPath))
    e.world_init(1, 32, 32)
    expect(e.creature_spawn(1, 2, 0)).toBe(0)
    expect(e.creature_spawn(3, 4, 1)).toBe(1)
    expect(e.creature_count()).toBe(2)
    const ids = Array.from(creatureView(e, 'id'))
    expect(new Set(ids).size).toBe(2)
    expect(e.genome_len()).toBe(GENOME_LEN)
    expect(e.learn_len()).toBe(LEARN_LEN)
    expect(e.trait_len()).toBe(TRAIT_LEN)
    expect(e.brain_in()).toBe(BRAIN_IN)
    expect(e.brain_out()).toBe(BRAIN_OUT)
    expect(e.mem_len()).toBe(MEM_LEN)
    expect(creatureView(e, 'memory').length).toBe(2 * MEM_LEN)
    expect(creatureView(e, 'signal').length).toBe(2)
    expect(creatureView(e, 'traits').length).toBe(2 * TRAIT_LEN)
    // the traits follow the swapped creature too
    const traits1 = creatureView(e, 'traits').slice(TRAIT_LEN)
    expect(creatureView(e, 'learned').length).toBe(2 * LEARN_LEN)
    expect(creatureView(e, 'genome').length).toBe(2 * GENOME_LEN)
    const g1 = creatureView(e, 'genome').slice(GENOME_LEN)
    e.creature_kill(0)
    expect(creatureView(e, 'genome')).toEqual(g1) // the genome follows the swapped creature
    expect(creatureView(e, 'traits')).toEqual(traits1)
    expect(e.creature_count()).toBe(1)
    expect(creatureView(e, 'id')[0]).toBe(ids[1])
    expect(creatureView(e, 'x')[0]).toBe(3)
    e.world_init(1, 32, 32)
    expect(e.creature_count()).toBe(0)
  })

  it('gives founders a body plan close to the default and a random lineage hue', async () => {
    const e = await loadEngine(readFileSync(wasmPath))
    e.world_init(5, 64, 64)
    e.world_populate(0, 100)
    const t = creatureView(e, 'traits')
    const hues = new Set<number>()
    for (let i = 0; i < 100; i++) {
      for (const k of [Trait.Size, Trait.Speed, Trait.Vision]) expect(Math.abs(t[i * TRAIT_LEN + k]! - 1)).toBeLessThanOrEqual(0.1 + 1e-6)
      hues.add(Math.round(t[i * TRAIT_LEN + Trait.Hue]! * 20))
    }
    expect(hues.size).toBeGreaterThan(8) // hues are spread over the wheel
    expect(e.stats_mean_trait(0, Trait.Size)).toBeCloseTo(1, 1)
    expect(e.stats_mean_trait(1, Trait.Size)).toBe(0) // no carnivores
    expect(e.stats_mean_trait(0, 9)).toBe(0) // invalid trait index
  })

  it('founders have only tanh neurons, nearly dark, with the new senses almost unwired', async () => {
    const e = await loadEngine(readFileSync(wasmPath))
    e.world_init(5, 64, 64)
    e.world_populate(0, 60)
    expect(e.stats_kind_share(0, 0)).toBe(1) // all founders' neurons are tanh
    for (const k of [1, 2, 3]) expect(e.stats_kind_share(0, k)).toBe(0)
    expect(e.stats_new_wiring(0)).toBeLessThan(0.15) // 10 % of a normal weight scale
    expect(e.stats_mean_signal(0)).toBe(0) // nobody has acted yet: no light
    for (let i = 0; i < 5; i++) e.tick()
    expect(e.stats_mean_signal(0)).toBeGreaterThan(0)
    expect(e.stats_mean_signal(0)).toBeLessThan(0.4) // the light output starts nearly dark
    expect(e.stats_kind_share(1, 0)).toBe(0) // no carnivores: no data
  })

  it('exposes per-species statistics', async () => {
    const e = await loadEngine(readFileSync(wasmPath))
    e.world_init(2, 64, 64)
    e.creature_spawn(10, 10, 0)
    e.creature_spawn(11, 10, 0)
    e.creature_spawn(12, 10, 1)
    expect(e.stats_count(0)).toBe(2)
    expect(e.stats_count(1)).toBe(1)
    expect(e.stats_mean_hidden(0)).toBe(4)
    expect(e.stats_mean_hidden(1)).toBe(4)
    // random brains: competence close to 0.5 (chance); 0 if the species is absent
    expect(Math.abs(e.stats_competence(0) - 0.5)).toBeLessThan(0.2)
    e.world_init(2, 64, 64)
    expect(e.stats_competence(1)).toBe(0)
  })

  it("is reborn from its best ancestors after an extinction", async () => {
    const e = await loadEngine(readFileSync(wasmPath))
    expect(e.elite_slots()).toBe(ELITE_SLOTS)
    e.world_init(31, 128, 128)
    e.world_populate(0, 200)
    for (let i = 0; i < 1500; i++) e.tick()
    expect(e.elite_count()).toBeGreaterThan(0) // the elite memory has filled up
    e.world_meteor(64, 64, 500) // cataclysm
    expect(e.creature_count()).toBe(0)
    for (let i = 0; i < 500; i++) e.tick() // the check happens every 500 ticks
    expect(e.world_rescues()).toBe(1)
    expect(e.stats_count(0)).toBeGreaterThanOrEqual(12)
    expect(e.stats_competence(0)).toBeGreaterThan(0.55) // descendants of the elites, not random brains
  })
})
