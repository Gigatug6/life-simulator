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

describe.runIf(existsSync(wasmPath))('performance (10,000 creatures)', () => {
  it('stays within reasonable budgets', async () => {
    const e = await loadEngine(readFileSync(wasmPath))
    const sim = new SimController(e)
    sim.init(7, 256, 256, 10_000, 0)
    expect(e.creature_count()).toBe(10_000)
    const [, tickMs] = time(() => {
      for (let i = 0; i < 20; i++) e.tick()
    })
    const [frame, frameMs] = time(() => sim.frame())
    const [, frameMs2] = time(() => sim.frame()) // without grass or index: the common case
    const [snap, snapMs] = time(() => takeSnapshot(e))
    const e2 = await loadEngine(readFileSync(wasmPath))
    const [ok, restoreMs] = time(() => restoreSnapshot(e2, snap))
    const n = e.creature_count()
    console.log(
      `PERF ${n} creatures: tick ${(tickMs / 20).toFixed(2)} ms | frame (1st) ${frameMs.toFixed(1)} ms, (current) ${frameMs2.toFixed(1)} ms | ` +
        `snapshot ${(snap.length / 1e6).toFixed(1)} MB in ${snapMs.toFixed(1)} ms, restore ${restoreMs.toFixed(1)} ms | ${frame.x.length} positions`,
    )
    expect(ok).toBe(true)
    // generous budgets (slow CI machine): 1 tick < 40 ms, frame < 40 ms, snapshot < 300 ms
    expect(tickMs / 20).toBeLessThan(40)
    expect(frameMs2).toBeLessThan(40)
    expect(snapMs).toBeLessThan(300)
  })
})
