/** Fills the 3D creature instance buffers (4×4 matrices + colours). Pure, testable. */
import { writeCreatureColor } from './instances'
import type { Ground } from './relief'
import type { Frame } from '../sim/protocol'

/** Body length in cells at the base scale; a creature is never drawn smaller than ~5 px on screen. */
export const creatureScale3d = (pixelsPerCell: number) => Math.max(1, 5 / Math.max(pixelsPerCell, 0.01))

/** The per-creature arrays of a frame that the 3D view needs. */
export type CreatureArrays = Pick<Frame, 'x' | 'y' | 'angle' | 'energy' | 'species' | 'size' | 'hue' | 'signal' | 'id'>

/** Output buffers of one species (one InstancedMesh each: herbivores = 0, carnivores = 1). */
export interface InstanceTarget {
  matrices: Float32Array
  colors: Float32Array
}

/** Half-length (in cells) of the ground sample used to tilt a body along the slope. */
const SLOPE_SPAN = 0.8
/** Hop of the walk cycle: height as a fraction of the body scale, and its speed in rad/s. */
const HOP = 0.1
const HOP_SPEED = 8

/**
 * Scene coordinates: x = world x, z = world y, y = height. The model's +x axis is its heading, +y is up.
 * Creatures stand on the ground (or on the water surface when wading), tilt along the slope and hop a
 * little as they walk. Species 0 and 1 are written to separate targets; returns how many of each.
 */
export function writeInstances3d(
  n: number,
  f: CreatureArrays,
  ground: Ground,
  pixelsPerCell: number,
  time: number,
  targets: [InstanceTarget, InstanceTarget],
): [number, number] {
  const base = creatureScale3d(pixelsPerCell)
  const counts: [number, number] = [0, 0]
  for (let i = 0; i < n; i++) {
    const sp = f.species[i] === 1 ? 1 : 0
    const t = targets[sp]
    const k = counts[sp]++
    const s = base * f.size[i]! * (1 + 0.35 * f.signal[i]!)
    const x = f.x[i]!
    const y = f.y[i]!
    const ca = Math.cos(f.angle[i]!)
    const sa = Math.sin(f.angle[i]!)

    // heading along the slope: X = (ca, rise, sa) normalised; Y = up made orthogonal to X; Z = X × Y
    const rise = (ground.at(x + ca * SLOPE_SPAN, y + sa * SLOPE_SPAN) - ground.at(x - ca * SLOPE_SPAN, y - sa * SLOPE_SPAN)) / (2 * SLOPE_SPAN)
    const lx = Math.hypot(ca, rise, sa)
    const xx = ca / lx
    const xy = rise / lx
    const xz = sa / lx
    const d = xy // dot((0,1,0), X)
    let yx = -d * xx
    let yy = 1 - d * xy
    let yz = -d * xz
    const ly = Math.hypot(yx, yy, yz)
    yx /= ly
    yy /= ly
    yz /= ly
    const zx = xy * yz - xz * yy
    const zy = xz * yx - xx * yz
    const zz = xx * yy - xy * yx

    const hop = Math.abs(Math.sin(time * HOP_SPEED + f.id[i]! * 1.7)) * HOP * s
    const m = k * 16
    const a = t.matrices
    a[m] = xx * s
    a[m + 1] = xy * s
    a[m + 2] = xz * s
    a[m + 3] = 0
    a[m + 4] = yx * s
    a[m + 5] = yy * s
    a[m + 6] = yz * s
    a[m + 7] = 0
    a[m + 8] = zx * s
    a[m + 9] = zy * s
    a[m + 10] = zz * s
    a[m + 11] = 0
    a[m + 12] = x
    a[m + 13] = Math.max(ground.at(x, y), 0) + 0.45 * s + hop
    a[m + 14] = y
    a[m + 15] = 1
    writeCreatureColor(t.colors, k, f.species[i]!, f.hue[i]!, f.energy[i]!, f.size[i]!, f.signal[i]!)
  }
  return counts
}

/**
 * Blob shadows: a flat disc under each creature, on the ground (or the water surface), sized with the
 * body. Cheap stand-in for real shadow maps, which would not scale to thousands of instances.
 */
export function writeShadows3d(n: number, f: Pick<CreatureArrays, 'x' | 'y' | 'size' | 'signal'>, ground: Ground, pixelsPerCell: number, matrices: Float32Array) {
  const base = creatureScale3d(pixelsPerCell)
  for (let i = 0; i < n; i++) {
    const r = base * f.size[i]! * 0.62
    const m = i * 16
    matrices[m] = r
    matrices[m + 1] = 0
    matrices[m + 2] = 0
    matrices[m + 3] = 0
    matrices[m + 4] = 0
    matrices[m + 5] = 1
    matrices[m + 6] = 0
    matrices[m + 7] = 0
    matrices[m + 8] = 0
    matrices[m + 9] = 0
    matrices[m + 10] = r
    matrices[m + 11] = 0
    matrices[m + 12] = f.x[i]!
    matrices[m + 13] = Math.max(ground.at(f.x[i]!, f.y[i]!), 0) + 0.06
    matrices[m + 14] = f.y[i]!
    matrices[m + 15] = 1
  }
}
