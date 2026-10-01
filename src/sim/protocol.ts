/** Messages échangés entre le thread UI et le worker de simulation. */
export const SPEEDS = [0, 1, 4, 16, 64] as const // ticks de simulation par image (0 = pause)
export type Speed = (typeof SPEEDS)[number]

export type ToWorker =
  | { type: 'init'; seed: number; w: number; h: number; herbivores: number; carnivores: number }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'spawn'; x: number; y: number; species: number; count: number }
  | { type: 'rain'; value: number }

/** Image envoyée à l'UI (buffers transférés, jamais partagés). */
export interface Frame {
  tick: number
  season: number
  daylight: number
  count: number
  herbivores: number
  carnivores: number
  hiddenHerbivores: number
  hiddenCarnivores: number
  x: Float32Array
  y: Float32Array
  angle: Float32Array
  energy: Float32Array
  species: Uint8Array
  /** Herbe (w*h), présente seulement une image sur quelques-unes. */
  grass: Float32Array | null
}

export type FromWorker =
  | { type: 'ready'; version: number }
  | { type: 'terrain'; w: number; h: number; biome: Uint8Array }
  | { type: 'frame'; frame: Frame; ticksPerSecond: number }
  | { type: 'error'; message: string }
