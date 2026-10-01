/** Fills the creature instance buffers (4×4 matrices + colours). Pure, testable. */

import { lineageRgb } from './creatureColor'

export const MAX_ENERGY = 100 // mirror of life::MAX_ENERGY

/** Size in cells: never smaller than ~4 px on screen. */
export const creatureSize = (zoom: number) => Math.max(1.1, 4 / zoom)

export function writeInstances(
  n: number,
  x: Float32Array,
  y: Float32Array,
  angle: Float32Array,
  energy: Float32Array,
  species: Uint8Array,
  size: Float32Array,
  hue: Float32Array,
  zoom: number,
  matrices: Float32Array,
  colors: Float32Array,
) {
  const base = creatureSize(zoom)
  for (let i = 0; i < n; i++) {
    const s = base * size[i]! // heritable body size
    // the world y axis points down: in the scene, y and the angle are flipped
    const a = -angle[i]!
    const c = Math.cos(a) * s
    const sn = Math.sin(a) * s
    const m = i * 16
    matrices[m] = c
    matrices[m + 1] = sn
    matrices[m + 2] = 0
    matrices[m + 3] = 0
    matrices[m + 4] = -sn
    matrices[m + 5] = c
    matrices[m + 6] = 0
    matrices[m + 7] = 0
    matrices[m + 8] = 0
    matrices[m + 9] = 0
    matrices[m + 10] = 1
    matrices[m + 11] = 0
    matrices[m + 12] = x[i]!
    matrices[m + 13] = -y[i]!
    matrices[m + 14] = 0.1
    matrices[m + 15] = 1
    const [r, g, b] = lineageRgb(species[i]!, hue[i]!)
    // brightness follows the energy relative to this body's own capacity (bigger bodies store more)
    const k = 0.45 + 0.55 * Math.min(1, Math.max(0, energy[i]! / (MAX_ENERGY * size[i]!)))
    colors[i * 3] = r * k
    colors[i * 3 + 1] = g * k
    colors[i * 3 + 2] = b * k
  }
}
