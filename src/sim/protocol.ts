/** Messages échangés entre le thread UI et le worker de simulation. */
export const SPEEDS = [0, 1, 4, 16, 64] as const // ticks de simulation par image (0 = pause)
/** Cadence de référence : ticks par seconde réelle à la vitesse ×1 (1 tick par image de 33 ms). */
export const TICK_RATE = 30
/** Rattrapage : au plus 60 s de calcul et 300 000 ticks. */
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
      /** Sauvegarde à reprendre ; ignorée si invalide (nouveau monde créé à la place). */
      snapshot?: Uint8Array
      /** Temps réel écoulé depuis la sauvegarde (ms) : le monde est « rattrapé » en rafale. */
      elapsedMs?: number
    }
  | { type: 'skipCatchup' }
  | { type: 'save' }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'spawn'; x: number; y: number; species: number; count: number }
  | { type: 'select'; id: number | null }
  | { type: 'rain'; value: number } // -1 (sécheresse) .. 1 (pluie)
  | { type: 'meteor'; x: number; y: number; r: number }
  | { type: 'bless'; x: number; y: number; r: number }

/** Détails d'une créature suivie (inspecteur). */
export interface Inspected {
  id: number
  x: number
  y: number
  energy: number
  age: number
  generation: number
  species: number
  hidden: number
  genome: Float32Array
}

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
  id: Uint32Array
  /** Créature suivie, ou null si aucune sélection / morte. */
  selected: Inspected | null
  /** Herbe (w*h), présente seulement une image sur quelques-unes. */
  grass: Float32Array | null
}

export type FromWorker =
  | { type: 'ready'; version: number; restored: boolean }
  | { type: 'catchup'; done: number; total: number; finished: boolean }
  | { type: 'snapshot'; data: Uint8Array; meta: { tick: number; seed: number } }
  | { type: 'terrain'; w: number; h: number; biome: Uint8Array }
  | { type: 'frame'; frame: Frame; ticksPerSecond: number }
  | { type: 'error'; message: string }
