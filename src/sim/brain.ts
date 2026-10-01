/** Décodage du génome d'un cerveau (miroir de wasm/src/brain.rs ; vérifié par test). */
export const BRAIN_IN = 10
export const BRAIN_HID_MAX = 12
export const BRAIN_HID_MIN = 3
export const BRAIN_OUT = 4

const W1 = 0
const B1 = W1 + BRAIN_HID_MAX * BRAIN_IN
const W2 = B1 + BRAIN_HID_MAX
const B2 = W2 + BRAIN_OUT * BRAIN_HID_MAX
const HID_GENE = B2 + BRAIN_OUT

export const INPUT_LABELS = ['Biais', 'Énergie', 'Nourriture ←', 'Nourriture ↑', 'Nourriture →', 'Obstacle ←', 'Obstacle ↑', 'Obstacle →', 'Voisins', 'Jour']
export const OUTPUT_LABELS = ['Avancer', 'Tourner', 'Manger / attaquer', 'Se reproduire']

export function hiddenCount(genome: Float32Array): number {
  const h = Math.trunc(genome[HID_GENE] ?? BRAIN_HID_MIN)
  return Math.min(BRAIN_HID_MAX, Math.max(BRAIN_HID_MIN, h))
}

export interface BrainShape {
  hidden: number
  /** w1[h][i] : poids de l'entrée i vers le neurone caché h. */
  w1: number[][]
  /** w2[o][h] : poids du neurone caché h vers la sortie o. */
  w2: number[][]
}

export function describeBrain(genome: Float32Array): BrainShape {
  const hidden = hiddenCount(genome)
  const w1 = Array.from({ length: hidden }, (_, h) => Array.from({ length: BRAIN_IN }, (_, i) => genome[W1 + h * BRAIN_IN + i]!))
  const w2 = Array.from({ length: BRAIN_OUT }, (_, o) => Array.from({ length: hidden }, (_, h) => genome[W2 + o * BRAIN_HID_MAX + h]!))
  return { hidden, w1, w2 }
}
