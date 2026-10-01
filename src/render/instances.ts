/** Remplit les tampons d'instances (matrices 4×4 + couleurs) des créatures. Pur, testable. */

export const MAX_ENERGY = 120 // miroir de life::MAX_ENERGY
const HERB: [number, number, number] = [1.0, 0.82, 0.25]
const CARN: [number, number, number] = [1.0, 0.2, 0.18]

/** Taille en cellules : jamais plus petite que ~4 px à l'écran. */
export const creatureSize = (zoom: number) => Math.max(1.1, 4 / zoom)

export function writeInstances(
  n: number,
  x: Float32Array,
  y: Float32Array,
  angle: Float32Array,
  energy: Float32Array,
  species: Uint8Array,
  zoom: number,
  matrices: Float32Array,
  colors: Float32Array,
) {
  const s = creatureSize(zoom)
  for (let i = 0; i < n; i++) {
    // l'axe y du monde pointe vers le bas : en scène, y et l'angle sont inversés
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
    const base = species[i] === 1 ? CARN : HERB
    const k = 0.45 + 0.55 * Math.min(1, Math.max(0, energy[i]! / MAX_ENERGY))
    colors[i * 3] = base[0] * k
    colors[i * 3 + 1] = base[1] * k
    colors[i * 3 + 2] = base[2] * k
  }
}
