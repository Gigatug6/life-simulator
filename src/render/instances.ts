/** Fills the creature instance buffers (4×4 matrices + colours). Pure, testable. */

import { lineageRgb } from './creatureColor'

export const MAX_ENERGY = 100 // mirror of life::MAX_ENERGY

/**
 * Writes the colour of creature `i` into `colors[i*3..]`: lineage hue, brightness following the energy
 * relative to the body's own capacity, washed out towards white while the creature glows.
 */
export function writeCreatureColor(
  colors: Float32Array,
  i: number,
  species: number,
  hue: number,
  energy: number,
  size: number,
  signal: number,
) {
  const [r, g, b] = lineageRgb(species, hue)
  const k = 0.45 + 0.55 * Math.min(1, Math.max(0, energy / (MAX_ENERGY * size)))
  const glow = signal * 0.75
  colors[i * 3] = r * k + (1 - r * k) * glow
  colors[i * 3 + 1] = g * k + (1 - g * k) * glow
  colors[i * 3 + 2] = b * k + (1 - b * k) * glow
}

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
  signal: Float32Array,
  zoom: number,
  matrices: Float32Array,
  colors: Float32Array,
) {
  const base = creatureSize(zoom)
  for (let i = 0; i < n; i++) {
    // heritable body size; a glowing creature is drawn a little bigger (its halo)
    const s = base * size[i]! * (1 + 0.35 * signal[i]!)
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
    writeCreatureColor(colors, i, species[i]!, hue[i]!, energy[i]!, size[i]!, signal[i]!)
  }
}
