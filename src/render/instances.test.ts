import { describe, expect, it } from 'vitest'
import { creatureSize, writeInstances } from './instances'

describe('writeInstances', () => {
  it('places the creatures (y flipped) and colours by species and energy', () => {
    const m = new Float32Array(32)
    const c = new Float32Array(6)
    writeInstances(2, new Float32Array([10, 20]), new Float32Array([5, 6]), new Float32Array([0, Math.PI / 2]),
      new Float32Array([120, 10]), new Uint8Array([0, 1]), 10, m, c)
    expect([m[12], m[13]]).toEqual([10, -5])
    expect([m[16 + 12], m[16 + 13]]).toEqual([20, -6])
    const s = creatureSize(10)
    expect(m[0]).toBeCloseTo(s)
    expect(m[1]).toBeCloseTo(0)
    expect(c[0]).toBeGreaterThan(c[2]!) // herbivore: yellow/orange
    expect(c[3]).toBeGreaterThan(c[4]!) // carnivore: red
    expect(c[3]).toBeLessThan(c[0]!) // less energy = darker (and red < yellow)
  })

  it('keeps a readable minimum size when zoomed out', () => {
    expect(creatureSize(1)).toBe(4)
    expect(creatureSize(20)).toBe(1.1)
  })
})
