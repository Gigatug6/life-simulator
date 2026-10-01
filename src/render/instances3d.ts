/** Fills the 3D creature instance buffers (4×4 matrices + colours). Pure, testable. */
import { writeCreatureColor } from './instances'
import type { Ground } from './relief'

/** Body length in cells at the base scale; a creature is never drawn smaller than ~5 px on screen. */
export const creatureScale3d = (pixelsPerCell: number) => Math.max(1, 5 / Math.max(pixelsPerCell, 0.01))

/**
 * Scene coordinates: x = world x, z = world y, y = height. The model is a cone pointing along +x.
 * Creatures stand on the ground, or on the water surface when they wade through shallows.
 */
export function writeInstances3d(
  n: number,
  x: Float32Array,
  y: Float32Array,
  angle: Float32Array,
  energy: Float32Array,
  species: Uint8Array,
  size: Float32Array,
  hue: Float32Array,
  signal: Float32Array,
  ground: Ground,
  pixelsPerCell: number,
  matrices: Float32Array,
  colors: Float32Array,
) {
  const base = creatureScale3d(pixelsPerCell)
  for (let i = 0; i < n; i++) {
    const s = base * size[i]! * (1 + 0.35 * signal[i]!)
    const ca = Math.cos(angle[i]!)
    const sa = Math.sin(angle[i]!)
    const m = i * 16
    // column 0: where +x (the heading) goes; column 1: up; column 2: the remaining axis
    matrices[m] = ca * s
    matrices[m + 1] = 0
    matrices[m + 2] = sa * s
    matrices[m + 3] = 0
    matrices[m + 4] = 0
    matrices[m + 5] = s
    matrices[m + 6] = 0
    matrices[m + 7] = 0
    matrices[m + 8] = -sa * s
    matrices[m + 9] = 0
    matrices[m + 10] = ca * s
    matrices[m + 11] = 0
    matrices[m + 12] = x[i]!
    matrices[m + 13] = Math.max(ground.at(x[i]!, y[i]!), 0) + 0.45 * s
    matrices[m + 14] = y[i]!
    matrices[m + 15] = 1
    writeCreatureColor(colors, i, species[i]!, hue[i]!, energy[i]!, size[i]!, signal[i]!)
  }
}
