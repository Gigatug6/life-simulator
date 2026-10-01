import { describe, expect, it } from 'vitest'
import { creatureScale3d, writeInstances3d } from './instances3d'
import { Ground, RELIEF, SEA_LEVEL, heightOfAltitude } from './relief'

const flat = (w: number, h: number, alt: number) => new Float32Array(w * h).fill(alt)

describe('Ground', () => {
  it('puts the water surface at height 0 and scales the relief', () => {
    expect(heightOfAltitude(SEA_LEVEL)).toBe(0)
    expect(heightOfAltitude(SEA_LEVEL + 0.5)).toBeCloseTo(0.5 * RELIEF)
    const g = new Ground(8, 6, flat(8, 6, SEA_LEVEL + 0.1))
    expect(g.vertexHeights.length).toBe(9 * 7)
    expect(g.at(3.3, 2.7)).toBeCloseTo(0.1 * RELIEF)
    expect(g.at(-5, 100)).toBeCloseTo(0.1 * RELIEF) // outside: clamped to the edge
  })

  it('interpolates between corner heights and matches the mesh vertices', () => {
    // two columns of cells: low on the left, high on the right
    const alt = new Float32Array([0.34, 0.54, 0.34, 0.54])
    const g = new Ground(2, 2, alt)
    expect(g.at(0, 0)).toBeCloseTo(0) // left edge
    expect(g.at(2, 0)).toBeCloseTo(0.2 * RELIEF) // right edge
    expect(g.at(1, 1)).toBeCloseTo(0.1 * RELIEF) // middle corner: mean of the four cells
    expect(g.at(0.5, 1)).toBeGreaterThan(g.at(0, 1))
    expect(g.at(1.5, 1)).toBeGreaterThan(g.at(0.5, 1))
    expect(g.at(1, 1)).toBe(g.vertexHeights[1 * 3 + 1]) // at a corner: exactly the vertex height
  })
})

describe('writeInstances3d', () => {
  const ground = new Ground(16, 16, new Float32Array(256).fill(SEA_LEVEL + 0.2))
  const one = (px: number, py: number, angle: number, scale = 10) => {
    const m = new Float32Array(16)
    const c = new Float32Array(3)
    writeInstances3d(1, new Float32Array([px]), new Float32Array([py]), new Float32Array([angle]), new Float32Array([50]),
      new Uint8Array([0]), new Float32Array([1]), new Float32Array([0.5]), new Float32Array([0]), ground, scale, m, c)
    return { m, c }
  }

  it('stands on the ground, with world y mapped to the scene z axis', () => {
    const { m } = one(5, 7, 0)
    expect([m[12], m[14]]).toEqual([5, 7])
    const s = creatureScale3d(10)
    expect(m[13]).toBeCloseTo(0.2 * RELIEF + 0.45 * s)
  })

  it('heads along the creature angle: +x model axis -> (cos a, 0, sin a)', () => {
    const east = one(5, 5, 0).m
    expect([east[0]!, east[2]!]).toEqual([creatureScale3d(10), 0])
    const south = one(5, 5, Math.PI / 2).m // world y grows towards the scene z axis
    expect(south[0]).toBeCloseTo(0)
    expect(south[2]).toBeCloseTo(creatureScale3d(10))
  })

  it('wades on the water surface in shallows instead of sinking under it', () => {
    const sea = new Ground(8, 8, new Float32Array(64).fill(SEA_LEVEL - 0.1))
    const m = new Float32Array(16)
    writeInstances3d(1, new Float32Array([4]), new Float32Array([4]), new Float32Array([0]), new Float32Array([50]),
      new Uint8Array([0]), new Float32Array([1]), new Float32Array([0.5]), new Float32Array([0]), sea, 10, m, new Float32Array(3))
    expect(m[13]).toBeGreaterThan(0) // above the water surface (height 0)
  })

  it('keeps creatures readable from far away', () => {
    expect(creatureScale3d(10)).toBe(1)
    expect(creatureScale3d(1)).toBe(5)
    expect(creatureScale3d(0)).toBeGreaterThan(100) // guarded against a division by zero
  })
})
