/** Messages exchanged between the UI thread and the simulation worker. */
export const SPEEDS = [0, 1, 4, 16, 64] as const // simulation ticks per frame (0 = pause)
/** Reference rate: ticks per real second at ×1 speed (1 tick per 33 ms frame). */
export const TICK_RATE = 30
/** Catch-up: at most 60 s of computation and 300,000 ticks. */
export const CATCHUP_MAX_MS = 60_000
export const CATCHUP_MAX_TICKS = 300_000

export type Speed = (typeof SPEEDS)[number]

export type ToWorker =
  | {
      type: 'init'
      seed: number
      w: number
      h: number
      herbivores: number
      carnivores: number
      /** Save to resume; ignored if invalid (a new world is created instead). */
      snapshot?: Uint8Array
      /** Real time elapsed since the save (ms): the world is "caught up" in a burst. */
      elapsedMs?: number
    }
  | { type: 'skipCatchup' }
  | { type: 'save' }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'spawn'; x: number; y: number; species: number; count: number }
  | { type: 'select'; id: number | null }
  | { type: 'rain'; value: number } // -1 (drought) .. 1 (rain)
  | { type: 'meteor'; x: number; y: number; r: number }
  | { type: 'bless'; x: number; y: number; r: number }

/** Details of a followed creature (inspector). */
export interface Inspected {
  id: number
  x: number
  y: number
  energy: number
  age: number
  generation: number
  species: number
  hidden: number
  /** Light signal 0..1 currently emitted. */
  signal: number
  genome: Float32Array
  /** Heritable physical traits: size, speed and vision multipliers (around 1) and the lineage hue (0..1). */
  traits: { size: number; speed: number; vision: number; hue: number }
}

/** Frame sent to the UI (buffers are transferred, never shared). */
export interface Frame {
  tick: number
  season: number
  daylight: number
  /** Rain (positive) or drought (negative), -1..1; fades by itself. */
  rain: number
  count: number
  herbivores: number
  carnivores: number
  hiddenHerbivores: number
  hiddenCarnivores: number
  /** Intelligence index 0-100 per species (null if the species is absent). */
  /** Number of rebirths (herbivores almost extinct, repopulated from the best ancestors). */
  rescues: number
  /** Mean body plan of the herbivores (multipliers around 1), null if there are none. */
  bodyHerbivores: { size: number; speed: number; vision: number } | null
  /** Share (0..1) of the herbivores' hidden neurons that are bump / step / wave neurons (the rest are tanh). */
  kindsHerbivores: { bump: number; step: number; wave: number } | null
  iqHerbivores: number | null
  iqCarnivores: number | null
  x: Float32Array
  y: Float32Array
  angle: Float32Array
  energy: Float32Array
  species: Uint8Array
  /** Light signal 0..1 emitted by each creature (bioluminescence). */
  signal: Float32Array
  /** Body-size multiplier per creature (around 1). */
  size: Float32Array
  /** Lineage hue per creature (0..1). */
  hue: Float32Array
  id: Uint32Array
  /** Followed creature, or null if nothing is selected / it is dead. */
  selected: Inspected | null
  /** Grass (w*h), only present on one frame out of a few. */
  grass: Float32Array | null
}

export type FromWorker =
  | { type: 'ready'; version: number; restored: boolean }
  | { type: 'catchup'; done: number; total: number; finished: boolean }
  | { type: 'snapshot'; data: Uint8Array; meta: { tick: number; seed: number } }
  | { type: 'terrain'; w: number; h: number; biome: Uint8Array; altitude: Float32Array }
  | { type: 'frame'; frame: Frame; ticksPerSecond: number }
  | { type: 'error'; message: string }
