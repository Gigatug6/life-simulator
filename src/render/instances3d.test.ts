import { describe, expect, it } from 'vitest'
import { GLOW_THRESHOLD, creatureScale3d, writeGlows3d, writeInstances3d, writeShadows3d, type CreatureArrays, type InstanceTarget } from './instances3d'
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

const target = (cap = 8): InstanceTarget => ({ matrices: new Float32Array(cap * 16), colors: new Float32Array(cap * 3) })
const arrays = (rows: Array<{ x: number; y: number; angle: number; species?: number; size?: number; signal?: number; asleep?: boolean; id?: number }>): CreatureArrays => ({
  x: Float32Array.from(rows.map((r) => r.x)),
  y: Float32Array.from(rows.map((r) => r.y)),
  angle: Float32Array.from(rows.map((r) => r.angle)),
  energy: Float32Array.from(rows.map(() => 50)),
  species: Uint8Array.from(rows.map((r) => r.species ?? 0)),
  size: Float32Array.from(rows.map((r) => r.size ?? 1)),
  hue: Float32Array.from(rows.map(() => 0.5)),
  signal: Float32Array.from(rows.map((r) => r.signal ?? 0)),
  asleep: Uint8Array.from(rows.map((r) => (r.asleep ? 1 : 0))),
  id: Uint32Array.from(rows.map((r, i) => r.id ?? i + 1)),
})

describe('writeInstances3d', () => {
  const ground = new Ground(16, 16, new Float32Array(256).fill(SEA_LEVEL + 0.2))
  const write = (rows: Parameters<typeof arrays>[0], ppc = 10, time = 0, g = ground) => {
    const t: [InstanceTarget, InstanceTarget] = [target(), target()]
    const counts = writeInstances3d(rows.length, arrays(rows), g, ppc, time, t)
    return { t, counts }
  }

  it('curls a sleeping creature up: flatter body, no hop, darker', () => {
    const { t } = write([{ x: 5, y: 7, angle: 0 }, { x: 8, y: 7, angle: 0, asleep: true }], 10, 0.3)
    const m = t[0].matrices
    const height = (o: number) => Math.hypot(m[o + 4]!, m[o + 5]!, m[o + 6]!)
    expect(height(16)).toBeLessThan(height(0) * 0.7)
    const s = creatureScale3d(10)
    expect(m[16 + 13]).toBeCloseTo(0.2 * RELIEF + 0.45 * height(16)) // sits on the ground, no hop (s * SLEEP_SQUASH tall)
    expect(height(16)).toBeCloseTo(s * 0.55)
    const c = t[0].colors
    expect(c[3]! + c[4]! + c[5]!).toBeLessThan(c[0]! + c[1]! + c[2]!)
  })

  it('stands on the ground, with world y mapped to the scene z axis', () => {
    const { t } = write([{ x: 5, y: 7, angle: 0 }], 10, 0)
    const m = t[0].matrices
    expect([m[12], m[14]]).toEqual([5, 7])
    // the hop is 0 at time 0 for this id (sin(0 + 1.7) is not 0, so allow the hop range)
    const s = creatureScale3d(10)
    expect(m[13]).toBeGreaterThanOrEqual(0.2 * RELIEF + 0.45 * s - 1e-6)
    expect(m[13]).toBeLessThanOrEqual(0.2 * RELIEF + 0.45 * s + 0.1 * s + 1e-6)
  })

  it('heads along the creature angle: +x model axis -> (cos a, 0, sin a) on flat ground', () => {
    const east = write([{ x: 5, y: 5, angle: 0 }]).t[0].matrices
    expect([east[0]!, east[2]!]).toEqual([creatureScale3d(10), 0])
    const south = write([{ x: 5, y: 5, angle: Math.PI / 2 }]).t[0].matrices // world y grows towards the scene z axis
    expect(south[0]).toBeCloseTo(0)
    expect(south[2]).toBeCloseTo(creatureScale3d(10))
  })

  it('produces an orthonormal basis scaled by the body size, on a slope too', () => {
    // a steep ramp rising along +x: 0.02 altitude per cell × RELIEF 42 = 0.84 per cell, i.e. about 40°
    const alt = new Float32Array(256)
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) alt[j * 16 + i] = SEA_LEVEL + 0.02 * i
    const ramp = new Ground(16, 16, alt)
    const { t } = write([{ x: 8, y: 8, angle: 0.4, size: 1.5 }], 10, 0, ramp)
    const m = t[0].matrices
    const s = creatureScale3d(10) * 1.5
    const col = (c: number) => [m[c * 4]!, m[c * 4 + 1]!, m[c * 4 + 2]!]
    const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
    for (const c of [0, 1, 2]) expect(Math.hypot(...col(c))).toBeCloseTo(s)
    expect(dot(col(0), col(1))).toBeCloseTo(0)
    expect(dot(col(0), col(2))).toBeCloseTo(0)
    expect(dot(col(1), col(2))).toBeCloseTo(0)
    expect(col(0)[1]).toBeGreaterThan(0) // heading up the ramp: the nose points upwards
    // the back tilts with the slope (cos 40° ≈ 0.77) but stays mostly up
    expect(col(1)[1]).toBeGreaterThan(0.7 * s)
    expect(col(1)[1]).toBeLessThan(0.85 * s)
  })

  it('splits the species into separate buffers and counts them', () => {
    const { t, counts } = write([
      { x: 1, y: 1, angle: 0, species: 0 },
      { x: 2, y: 2, angle: 0, species: 1 },
      { x: 3, y: 3, angle: 0, species: 0 },
    ])
    expect(counts).toEqual([2, 1])
    expect([t[0].matrices[12], t[0].matrices[16 + 12]]).toEqual([1, 3])
    expect(t[1].matrices[12]).toBe(2)
  })

  it('hops: the height varies over time, within the hop amplitude, and differs between creatures', () => {
    const rows = [{ x: 4, y: 4, angle: 0, id: 1 }, { x: 8, y: 8, angle: 0, id: 2 }]
    const heights = [0, 0.1, 0.2, 0.3, 0.4].map((time) => write(rows, 10, time).t[0].matrices[13]!)
    const lo = Math.min(...heights)
    const hi = Math.max(...heights)
    expect(hi - lo).toBeGreaterThan(0.01)
    expect(hi - lo).toBeLessThanOrEqual(0.1 * creatureScale3d(10) + 1e-6)
    const a = write(rows, 10, 0.37).t[0].matrices
    expect(a[13]).not.toBeCloseTo(a[16 + 13]!, 5) // different ids: out of phase
  })

  it('wades on the water surface in shallows instead of sinking under it', () => {
    const sea = new Ground(8, 8, new Float32Array(64).fill(SEA_LEVEL - 0.1))
    const { t } = write([{ x: 4, y: 4, angle: 0 }], 10, 0, sea)
    expect(t[0].matrices[13]).toBeGreaterThan(0) // above the water surface (height 0)
  })

  it('keeps creatures readable from far away', () => {
    expect(creatureScale3d(10)).toBe(1)
    expect(creatureScale3d(1)).toBe(5)
    expect(creatureScale3d(0)).toBeGreaterThan(100) // guarded against a division by zero
  })
})

describe('writeGlows3d', () => {
  const ground = new Ground(16, 16, new Float32Array(256).fill(SEA_LEVEL + 0.1))
  const run = (rows: Parameters<typeof arrays>[0]) => {
    const m = new Float32Array(rows.length * 16)
    const c = new Float32Array(rows.length * 3)
    const count = writeGlows3d(rows.length, arrays(rows), ground, 10, m, c)
    return { m, c, count }
  }

  it('only creatures that shine get a glow, packed one after the other', () => {
    const { m, count } = run([
      { x: 1, y: 1, angle: 0, signal: 0 },
      { x: 5, y: 6, angle: 0, signal: 0.8 },
      { x: 3, y: 3, angle: 0, signal: GLOW_THRESHOLD - 0.01 },
      { x: 9, y: 2, angle: 0, signal: 0.5 },
    ])
    expect(count).toBe(2)
    expect([m[12], m[14]]).toEqual([5, 6]) // the first glow is the second creature
    expect([m[16 + 12], m[16 + 14]]).toEqual([9, 2])
  })

  it('brighter signal: bigger and brighter glow, hovering above the body', () => {
    const { m, c } = run([{ x: 4, y: 4, angle: 0, signal: 0.3 }, { x: 8, y: 8, angle: 0, signal: 1 }])
    expect(m[16]!).toBeGreaterThan(m[0]!) // radius grows with the signal
    expect(c[3]! + c[4]! + c[5]!).toBeGreaterThan(c[0]! + c[1]! + c[2]!)
    expect(m[13]).toBeGreaterThan(0.1 * RELIEF) // above the ground
    for (const v of c) expect(v).toBeLessThanOrEqual(1 + 1e-6)
  })

  it('writes nothing when nobody shines', () => {
    expect(run([{ x: 1, y: 1, angle: 0, signal: 0 }]).count).toBe(0)
  })
})

describe('writeShadows3d', () => {
  it('lays a flat disc on the ground under each creature, sized with the body', () => {
    const ground = new Ground(16, 16, new Float32Array(256).fill(SEA_LEVEL + 0.1))
    const m = new Float32Array(32)
    writeShadows3d(2, { x: Float32Array.of(3, 9), y: Float32Array.of(4, 6), size: Float32Array.of(1, 2), signal: Float32Array.of(0, 0) }, ground, 10, m)
    expect([m[12], m[14]]).toEqual([3, 4])
    expect(m[13]).toBeCloseTo(0.1 * RELIEF + 0.06)
    expect(m[5]).toBe(1) // flat: the disc is not stretched vertically
    expect(m[16]).toBeCloseTo(2 * m[0]!) // twice the size: twice the radius
  })
})
