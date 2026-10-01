import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadEngine } from './engine'

const wasmPath = new URL('./wasm/life.wasm', import.meta.url)

describe.runIf(existsSync(wasmPath))('moteur WASM', () => {
  it('charge le module et répond', async () => {
    const e = await loadEngine(readFileSync(wasmPath))
    expect(e.version()).toBe(1)
    expect(e.add(2, 3)).toBe(5)
    expect(e.tick()).toBe(1)
    expect(e.tick()).toBe(2)
  })
})
