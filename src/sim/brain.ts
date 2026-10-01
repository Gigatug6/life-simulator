/** Decoding of a brain genome (mirror of wasm/src/brain.rs; checked by a test). */
export const BRAIN_IN = 14
export const BRAIN_HID_MAX = 12
export const BRAIN_HID_MIN = 3
export const BRAIN_OUT = 5

const W1 = 0
const B1 = W1 + BRAIN_HID_MAX * BRAIN_IN
const W2 = B1 + BRAIN_HID_MAX
const B2 = W2 + BRAIN_OUT * BRAIN_HID_MAX
const ACT = B2 + BRAIN_OUT
const HID_GENE = ACT + BRAIN_HID_MAX

export const INPUT_LABELS = [
  'Herbe ici', 'Énergie', 'Nourriture ←', 'Nourriture ↑', 'Nourriture →', 'Obstacle ←', 'Obstacle ↑', 'Obstacle →',
  'Voisins', 'Jour', 'Danger', 'Lumière voisins', 'Mémoire 1', 'Mémoire 2',
]
export const OUTPUT_LABELS = ['Avancer', 'Tourner', 'Manger / attaquer', 'Se reproduire', 'Lumière']

/** Kinds of hidden neuron (mirror of brain::ACT_*): UI names and the shape drawn in the brain diagram. */
export const NEURON_KINDS = [
  { name: 'tanh', label: 'Classique', shape: 'circle' },
  { name: 'bump', label: 'Détecteur', shape: 'diamond' },
  { name: 'step', label: 'Interrupteur', shape: 'square' },
  { name: 'wave', label: 'Onde', shape: 'triangle' },
] as const

export function hiddenCount(genome: Float32Array): number {
  const h = Math.trunc(genome[HID_GENE] ?? BRAIN_HID_MIN)
  return Math.min(BRAIN_HID_MAX, Math.max(BRAIN_HID_MIN, h))
}

/** Kind (index into NEURON_KINDS) of hidden neuron `h`; unknown values fall back to tanh like the engine does. */
export function neuronKind(genome: Float32Array, h: number): number {
  const k = Math.trunc((genome[ACT + h] ?? 0) + 0.5)
  return k >= 0 && k < NEURON_KINDS.length ? k : 0
}

export interface BrainShape {
  hidden: number
  /** w1[h][i]: weight from input i to hidden neuron h. */
  w1: number[][]
  /** w2[o][h]: weight from hidden neuron h to output o. */
  w2: number[][]
  /** Kind of each active hidden neuron (index into NEURON_KINDS). */
  kinds: number[]
}

export function describeBrain(genome: Float32Array): BrainShape {
  const hidden = hiddenCount(genome)
  const w1 = Array.from({ length: hidden }, (_, h) => Array.from({ length: BRAIN_IN }, (_, i) => genome[W1 + h * BRAIN_IN + i]!))
  const w2 = Array.from({ length: BRAIN_OUT }, (_, o) => Array.from({ length: hidden }, (_, h) => genome[W2 + o * BRAIN_HID_MAX + h]!))
  const kinds = Array.from({ length: hidden }, (_, h) => neuronKind(genome, h))
  return { hidden, w1, w2, kinds }
}
