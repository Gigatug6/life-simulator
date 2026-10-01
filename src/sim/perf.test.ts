import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadEngine } from './engine'
import { SimController } from './controller'
import { restoreSnapshot, takeSnapshot } from './snapshot'

const wasmPath = new URL('./wasm/life.wasm', import.meta.url)
const time = <T>(fn: () => T): [T, number] => {
  const t = performance.now()
  const r = fn()
  return [r, performance.now() - t]
}

describe.runIf(existsSync(wasmPath))('performance (10 000 créatures)', () => {
  it('reste dans des budgets raisonnables', async () => {
    const e = await loadEngine(readFileSync(wasmPath))
    const sim = new SimController(e)
    sim.init(7, 256, 256, 10_000, 0)
    expect(e.creature_count()).toBe(10_000)
    const [, tickMs] = time(() => {
      for (let i = 0; i < 20; i++) e.tick()
    })
    const [frame, frameMs] = time(() => sim.frame())
    const [, frameMs2] = time(() => sim.frame()) // sans herbe ni indice : le cas courant
    const [snap, snapMs] = time(() => takeSnapshot(e))
    const e2 = await loadEngine(readFileSync(wasmPath))
    const [ok, restoreMs] = time(() => restoreSnapshot(e2, snap))
    const n = e.creature_count()
    console.log(
      `PERF ${n} créatures : tick ${(tickMs / 20).toFixed(2)} ms | image (1re) ${frameMs.toFixed(1)} ms, (courante) ${frameMs2.toFixed(1)} ms | ` +
        `snapshot ${(snap.length / 1e6).toFixed(1)} Mo en ${snapMs.toFixed(1)} ms, restauration ${restoreMs.toFixed(1)} ms | ${frame.x.length} positions`,
    )
    expect(ok).toBe(true)
    // budgets larges (machine de CI lente) : 1 tick < 40 ms, image < 40 ms, snapshot < 300 ms
    expect(tickMs / 20).toBeLessThan(40)
    expect(frameMs2).toBeLessThan(40)
    expect(snapMs).toBeLessThan(300)
  })
})
