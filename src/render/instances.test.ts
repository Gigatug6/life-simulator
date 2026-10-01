import { describe, expect, it } from 'vitest'
import { creatureSize, writeInstances } from './instances'
import { lineageRgb } from './creatureColor'

describe('writeInstances', () => {
  it('places the creatures (y flipped) and colours by species and energy', () => {
    const m = new Float32Array(32)
    const c = new Float32Array(6)
    writeInstances(2, new Float32Array([10, 20]), new Float32Array([5, 6]), new Float32Array([0, Math.PI / 2]),
      new Float32Array([120, 10]), new Uint8Array([0, 1]), new Float32Array([1, 1]), new Float32Array([0.5, 0.5]), new Float32Array([0, 0]), new Uint8Array([0, 0]), 10, m, c)
    expect([m[12], m[13]]).toEqual([10, -5])
    expect([m[16 + 12], m[16 + 13]]).toEqual([20, -6])
    const s = creatureSize(10)
    expect(m[0]).toBeCloseTo(s)
    expect(m[1]).toBeCloseTo(0)
    expect(c[0]).toBeGreaterThan(c[2]!) // herbivore: yellow/orange
    expect(c[3]).toBeGreaterThan(c[4]!) // carnivore: red
    expect(c[3]).toBeLessThan(c[0]!) // less energy = darker (and red < yellow)
  })

  it('scales the body with the size gene and tints it with the lineage hue', () => {
    const m = new Float32Array(32)
    const c = new Float32Array(6)
    writeInstances(2, new Float32Array([1, 2]), new Float32Array([1, 2]), new Float32Array([0, 0]),
      new Float32Array([50, 50]), new Uint8Array([0, 0]), new Float32Array([1, 1.5]), new Float32Array([0.1, 0.9]), new Float32Array([0, 0]), new Uint8Array([0, 0]), 10, m, c)
    expect(m[16]!).toBeCloseTo(m[0]! * 1.5) // the bigger creature is drawn bigger
    // different lineage hues give clearly different colours within the same species
    expect(Math.abs(c[0]! - c[3]!) + Math.abs(c[1]! - c[4]!) + Math.abs(c[2]! - c[5]!)).toBeGreaterThan(0.2)
  })

  it('draws a sleeping creature darker', () => {
    const m = new Float32Array(32)
    const c = new Float32Array(6)
    writeInstances(2, new Float32Array([1, 2]), new Float32Array([1, 2]), new Float32Array([0, 0]),
      new Float32Array([50, 50]), new Uint8Array([0, 0]), new Float32Array([1, 1]), new Float32Array([0.5, 0.5]), new Float32Array([0, 0]), new Uint8Array([0, 1]), 10, m, c)
    expect(c[3]! + c[4]! + c[5]!).toBeLessThan((c[0]! + c[1]! + c[2]!) * 0.7)
  })

  it('makes glowing creatures brighter and slightly bigger', () => {
    const m = new Float32Array(32)
    const c = new Float32Array(6)
    writeInstances(2, new Float32Array([1, 2]), new Float32Array([1, 2]), new Float32Array([0, 0]),
      new Float32Array([50, 50]), new Uint8Array([0, 0]), new Float32Array([1, 1]), new Float32Array([0.5, 0.5]), new Float32Array([0, 1]), new Uint8Array([0, 0]), 10, m, c)
    expect(m[16]!).toBeGreaterThan(m[0]!) // glowing creature: bigger halo
    const sum = (o: number) => c[o]! + c[o + 1]! + c[o + 2]!
    expect(sum(3)).toBeGreaterThan(sum(0)) // and brighter (washed out towards white)
    for (const v of c) expect(v).toBeLessThanOrEqual(1)
  })

  it('keeps species distinguishable whatever the lineage hue', () => {
    for (let h = 0; h <= 1; h += 0.1) {
      const [hr, hg] = lineageRgb(0, h) // herbivore: never red-dominant (green channel carries it)
      const [cr, cg] = lineageRgb(1, h) // carnivore: red channel dominates green
      expect(hg).toBeGreaterThan(0.3)
      expect(cr).toBeGreaterThan(cg)
      expect(hr).toBeGreaterThan(0)
    }
  })

  it('keeps a readable minimum size when zoomed out', () => {
    expect(creatureSize(1)).toBe(4)
    expect(creatureSize(20)).toBe(1.1)
  })
})
