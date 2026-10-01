import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Biome, altitudeView, biomeView, loadEngine } from './engine'

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
})
