import { describe, expect, it } from 'vitest'
import { MAX_TREES, STRIDE, buildLayout, crownScale, fireflyAnchors, foliageRgb, hash01, tuftRgb, tuftScale } from './vegetationLayout'

/** A 40×30 world: forest left, plain middle, mountain top-right, water elsewhere. */
function world() {
  const w = 40
  const h = 30
  const biome = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      biome[j * w + i] = i < 12 ? 4 : i < 28 ? 3 : j < 10 ? 5 : 1
    }
  }
  return { w, h, biome }
}

describe('hash01', () => {
  it('is deterministic, in [0, 1) and spread out', () => {
    expect(hash01(3, 7, 1)).toBe(hash01(3, 7, 1))
    expect(hash01(3, 7, 1)).not.toBe(hash01(7, 3, 1))
    let min = 1
    let max = 0
    let sum = 0
    for (let k = 0; k < 5000; k++) {
      const v = hash01(k, k * 3, 2)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      min = Math.min(min, v)
      max = Math.max(max, v)
      sum += v
    }
    expect(min).toBeLessThan(0.02)
    expect(max).toBeGreaterThan(0.98)
    expect(sum / 5000).toBeGreaterThan(0.45)
    expect(sum / 5000).toBeLessThan(0.55)
  })
})

describe('buildLayout', () => {
  const { w, h, biome } = world()
  const layout = buildLayout(w, h, biome)
  const cellOf = (data: Float32Array, k: number) => data[k * STRIDE + 5]!

  it('is deterministic', () => {
    const again = buildLayout(w, h, biome)
    expect(again.trees).toEqual(layout.trees)
    expect(again.tufts).toEqual(layout.tufts)
    expect(again.rocks).toEqual(layout.rocks)
  })

  it('puts trees only in forests, rocks only on mountains, tufts on land but never on water or rock', () => {
    expect(layout.treeCount).toBeGreaterThan(60) // 12 × 30 forest cells at ~30 %
    expect(layout.treeCount).toBeLessThan(160)
    for (let k = 0; k < layout.treeCount; k++) expect(biome[cellOf(layout.trees, k)]).toBe(4)
    expect(layout.rockCount).toBeGreaterThan(5)
    for (let k = 0; k < layout.rockCount; k++) expect(biome[cellOf(layout.rocks, k)]).toBe(5)
    expect(layout.tuftCount).toBeGreaterThan(100)
    for (let k = 0; k < layout.tuftCount; k++) expect([2, 3, 4]).toContain(biome[cellOf(layout.tufts, k)])
  })

  it('places items inside their own cell, with sizes in range', () => {
    for (let k = 0; k < layout.treeCount; k++) {
      const x = layout.trees[k * STRIDE]!
      const y = layout.trees[k * STRIDE + 1]!
      const cell = cellOf(layout.trees, k)
      expect(Math.floor(x)).toBe(cell % w)
      expect(Math.floor(y)).toBe(Math.floor(cell / w))
      const s = layout.trees[k * STRIDE + 2]!
      expect(s).toBeGreaterThanOrEqual(0.7)
      expect(s).toBeLessThanOrEqual(1.4)
    }
  })

  it('keeps an evenly spread subset when there are too many trees', () => {
    const big = 256
    const all = new Uint8Array(big * big).fill(4) // all forest: ~19 600 candidates
    const l = buildLayout(big, big, all)
    expect(l.treeCount).toBeLessThanOrEqual(MAX_TREES)
    expect(l.treeCount).toBeGreaterThan(MAX_TREES * 0.95)
    // spread over the whole map, not cut off after the first rows
    let maxY = 0
    for (let k = 0; k < l.treeCount; k++) maxY = Math.max(maxY, l.trees[k * STRIDE + 1]!)
    expect(maxY).toBeGreaterThan(big * 0.9)
  })
})

describe('fireflyAnchors', () => {
  const { w, h, biome } = world()
  const layout = buildLayout(w, h, biome)

  it('hovers over the trees, at most `max`, deterministic, with a phase in 0..1', () => {
    const a = fireflyAnchors(layout, 50)
    expect(a.length).toBe(50 * 3)
    expect(fireflyAnchors(layout, 50)).toEqual(a)
    for (let k = 0; k < 50; k++) {
      expect(a[k * 3]!).toBeGreaterThanOrEqual(-1) // near the forest (cells 0..11), jittered by < 1
      expect(a[k * 3]!).toBeLessThan(13)
      expect(a[k * 3 + 2]!).toBeGreaterThanOrEqual(0)
      expect(a[k * 3 + 2]!).toBeLessThan(1)
    }
    expect(fireflyAnchors(layout, 100000).length).toBe(layout.treeCount * 3) // never more than there are trees
  })

  it('falls back to the grass tufts in a world without trees', () => {
    const plain = new Uint8Array(30 * 30).fill(3)
    const l = buildLayout(30, 30, plain)
    expect(l.treeCount).toBe(0)
    expect(fireflyAnchors(l, 40).length).toBe(40 * 3)
  })
})

describe('tuftScale', () => {
  it('shrinks with the grass and disappears when the cell is grazed bare', () => {
    expect(tuftScale(1, 3)).toBe(1)
    expect(tuftScale(0.5, 3)).toBeCloseTo(0.675)
    expect(tuftScale(0.05, 3)).toBe(0) // grazed
    expect(tuftScale(0, 3)).toBe(0)
    expect(tuftScale(0.8, 4)).toBe(1) // a full forest floor (capacity 0.8) is full grass
    expect(tuftScale(0.4, 4)).toBeLessThan(tuftScale(0.8, 4))
  })
})

describe('seasonal colours', () => {
  const summer = { autumn: 0, winter: 0 }
  it('foliage: green in summer, orange in autumn, pale in winter', () => {
    const [sr, sg] = foliageRgb(summer, 0.5)
    expect(sg).toBeGreaterThan(sr * 2) // green dominates
    const [ar, ag, ab] = foliageRgb({ autumn: 1, winter: 0 }, 0.5)
    expect(ar).toBeGreaterThan(ag)
    expect(ag).toBeGreaterThan(ab) // orange: red > green > blue
    const [wr, wg, wb] = foliageRgb({ autumn: 0, winter: 1 }, 0.5)
    expect(Math.min(wr, wg, wb)).toBeGreaterThan(0.6) // frosty
  })
  it('variation makes neighbouring trees differ', () => {
    expect(foliageRgb(summer, 0)).not.toEqual(foliageRgb(summer, 1))
  })
  it('tufts turn to straw in autumn and the crowns thin out in winter', () => {
    expect(tuftRgb({ autumn: 1, winter: 0 }, 0.5)[0]).toBeGreaterThan(tuftRgb(summer, 0.5)[0])
    expect(crownScale(summer)).toBe(1)
    expect(crownScale({ autumn: 0, winter: 1 })).toBeCloseTo(0.7)
  })
})
