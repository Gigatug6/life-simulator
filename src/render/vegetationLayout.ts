/**
 * Where trees, grass tufts and rocks stand in the 3D view. Pure and deterministic: the same world always
 * gets the same decor, and nothing here depends on three.js.
 */
import type { RGB } from './sky'
import type { SeasonFactors } from './seasons'

/** Biome ids (mirror of wasm/src/world.rs). */
const BEACH = 2
const PLAIN = 3
const FOREST = 4
const MOUNTAIN = 5

/** Max grass per biome (mirror of plants::capacity), to turn the grass layer into a 0..1 ratio. */
const CAPACITY: Record<number, number> = { [BEACH]: 0.1, [PLAIN]: 1, [FOREST]: 0.8, [MOUNTAIN]: 0.15 }

export const MAX_TREES = 9000
export const MAX_TUFTS = 16000
export const MAX_ROCKS = 3000

/** Stable pseudo-random number in [0, 1) from a cell and a salt. */
export function hash01(i: number, j: number, salt: number): number {
  let h = (i * 374761393 + j * 668265263 + salt * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Floats per item in the layout arrays: world x, world y, scale, yaw, variation (0..1), cell index. */
export const STRIDE = 6

export interface Layout {
  trees: Float32Array
  tufts: Float32Array
  rocks: Float32Array
  treeCount: number
  tuftCount: number
  rockCount: number
}

function collect(w: number, h: number, biome: Uint8Array, kind: 'trees' | 'tufts' | 'rocks', max: number): { data: Float32Array; count: number } {
  const salt = kind === 'trees' ? 1 : kind === 'tufts' ? 2 : 3
  const out: number[] = []
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const b = biome[j * w + i]!
      const r = hash01(i, j, salt)
      let keep = false
      if (kind === 'trees') keep = b === FOREST && r < 0.3 // sparse enough to leave clearings where the creatures stay visible from above
      else if (kind === 'tufts') keep = (b === PLAIN || b === FOREST || b === BEACH) && r < (b === PLAIN ? 0.5 : b === FOREST ? 0.35 : 0.15)
      else keep = b === MOUNTAIN && r < 0.12
      if (!keep) continue
      const x = i + 0.15 + 0.7 * hash01(i, j, salt + 10)
      const y = j + 0.15 + 0.7 * hash01(i, j, salt + 20)
      const lo = kind === 'trees' ? 0.7 : 0.7
      const hi = kind === 'trees' ? 1.4 : kind === 'tufts' ? 1.3 : 2.4
      out.push(x, y, lo + (hi - lo) * hash01(i, j, salt + 30), hash01(i, j, salt + 40) * Math.PI * 2, hash01(i, j, salt + 50), j * w + i)
    }
  }
  // too many: keep an evenly spread subset (deterministic) instead of cutting off a whole region
  const total = out.length / STRIDE
  const step = total > max ? total / max : 1
  const kept: number[] = []
  for (let k = 0; k < total && kept.length / STRIDE < max; k += step) {
    const at = Math.floor(k) * STRIDE
    for (let s = 0; s < STRIDE; s++) kept.push(out[at + s]!)
  }
  return { data: Float32Array.from(kept), count: kept.length / STRIDE }
}

export function buildLayout(w: number, h: number, biome: Uint8Array): Layout {
  const trees = collect(w, h, biome, 'trees', MAX_TREES)
  const tufts = collect(w, h, biome, 'tufts', MAX_TUFTS)
  const rocks = collect(w, h, biome, 'rocks', MAX_ROCKS)
  return { trees: trees.data, tufts: tufts.data, rocks: rocks.data, treeCount: trees.count, tuftCount: tufts.count, rockCount: rocks.count }
}

/**
 * Where the fireflies hover: spread over the trees (or over the grass tufts of a treeless world), with a
 * random phase each. Returns [x, y, phase] triples (world x, world y, phase in 0..1).
 */
export function fireflyAnchors(layout: Layout, max: number): Float32Array {
  const source = layout.treeCount >= 20 ? layout.trees : layout.tufts
  const count = layout.treeCount >= 20 ? layout.treeCount : layout.tuftCount
  const n = Math.min(max, count)
  const out = new Float32Array(n * 3)
  const step = count / Math.max(n, 1)
  for (let k = 0; k < n; k++) {
    const o = Math.floor(k * step) * STRIDE
    out[k * 3] = source[o]! + (hash01(k, 7, 91) - 0.5) * 1.6
    out[k * 3 + 1] = source[o + 1]! + (hash01(k, 8, 92) - 0.5) * 1.6
    out[k * 3 + 2] = hash01(k, 9, 93)
  }
  return out
}

/** Size multiplier (0..1) of a grass tuft from the grass of its cell: grazed cells lose their tufts. */
export function tuftScale(grass: number, biome: number): number {
  const cap = CAPACITY[biome] ?? 1
  const ratio = Math.min(1, Math.max(0, grass / cap))
  return ratio < 0.12 ? 0 : 0.35 + 0.65 * ratio
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

/** Foliage colour (linear-ish RGB 0..1) of a tree: greens in summer, oranges in autumn, frosty in winter. */
export function foliageRgb(f: SeasonFactors, variation: number): RGB {
  const green: RGB = [0.1 + 0.07 * variation, 0.4 + 0.18 * variation, 0.13 + 0.05 * variation]
  const autumn: RGB = [0.78 - 0.18 * variation, 0.32 + 0.3 * variation, 0.07]
  const frost: RGB = [0.82, 0.88, 0.92]
  return mix(mix(green, autumn, Math.min(1, f.autumn * 1.1)), frost, f.winter * 0.8)
}

/** Colour of a grass tuft: fresh green, straw in autumn, pale in winter. */
export function tuftRgb(f: SeasonFactors, variation: number): RGB {
  const green: RGB = [0.22 + 0.1 * variation, 0.55 + 0.15 * variation, 0.16]
  const straw: RGB = [0.72, 0.58, 0.2]
  const frost: RGB = [0.78, 0.84, 0.82]
  return mix(mix(green, straw, f.autumn * 0.85), frost, f.winter * 0.75)
}

/** Crown size multiplier: the leaves thin out in winter. */
export const crownScale = (f: SeasonFactors) => 1 - 0.3 * f.winter - 0.08 * f.autumn
