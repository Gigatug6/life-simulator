/** Timing and look of the weather and of the "God" effects. Pure and testable (no three.js here). */

export type EffectKind = 'meteor' | 'bless' | 'spawn'

/** A visual event at a place of the world (cells). `species` tints the spawn pulse. */
export interface WorldEffect {
  kind: EffectKind
  x: number
  y: number
  radius: number
  species?: number
}

/** The meteor falls for this long (s); the engine call is delayed by the same amount so that creatures vanish at the impact. */
export const METEOR_FALL = 0.7
const DURATION: Record<EffectKind, number> = { meteor: 3.4, bless: 2.4, spawn: 0.8 }

export const effectDuration = (kind: EffectKind) => DURATION[kind]

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 3

export interface MeteorState {
  /** Falling towards the impact. */
  falling: boolean
  /** 0 at the start of the fall .. 1 at the impact. */
  fall: number
  /** Seconds since the impact (0 while falling). */
  since: number
  /** Shock wave radius as a fraction of the blast radius (0..1.15), and its opacity. */
  wave: number
  waveAlpha: number
  /** White flash opacity right after the impact. */
  flash: number
  /** Scorched-ground opacity: appears at the impact, fades slowly. */
  scorch: number
}

export function meteorState(t: number): MeteorState {
  if (t < METEOR_FALL) {
    return { falling: true, fall: clamp01(t / METEOR_FALL), since: 0, wave: 0, waveAlpha: 0, flash: 0, scorch: 0 }
  }
  const since = t - METEOR_FALL
  return {
    falling: false,
    fall: 1,
    since,
    wave: 1.15 * easeOut(since / 0.9),
    waveAlpha: 0.9 * (1 - clamp01(since / 1.1)),
    flash: 1 - clamp01(since / 0.45),
    scorch: 0.55 * (1 - clamp01((since - 0.6) / (DURATION.meteor - METEOR_FALL - 0.6))),
  }
}

/** Bless: a column of light that swells and fades. Returns its opacity (0..1) at time t. */
export function blessAlpha(t: number): number {
  const u = clamp01(t / DURATION.bless)
  return Math.sin(Math.PI * u) ** 1.5
}

/** Look of the world under a rain/drought value in [-1, 1] (positive = rain, negative = drought). */
export interface WeatherLook {
  /** 0..1 intensity of the falling rain. */
  rainAmount: number
  /** 0..1 intensity of the drought haze. */
  drought: number
  /** Multiplier of the sunlight (clouds). */
  lightScale: number
  /** 0..1: how much the sky and fog are pulled towards grey. */
  grey: number
  /** 0..1: how much the light and the sky are pulled towards a dusty orange. */
  warm: number
}

export function weatherLook(rain: number): WeatherLook {
  const r = Math.min(1, Math.max(0, rain))
  const d = Math.min(1, Math.max(0, -rain))
  // the weather only shows beyond a small dead zone, so that the tail of a fading rain does not flicker
  const rainAmount = r < 0.08 ? 0 : r
  const drought = d < 0.08 ? 0 : d
  return { rainAmount, drought, lightScale: 1 - 0.45 * rainAmount + 0.05 * drought, grey: 0.7 * rainAmount, warm: 0.55 * drought }
}
