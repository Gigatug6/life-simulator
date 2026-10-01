/** Sun, moon and sky colours as a function of the simulation clock. Pure and testable. */

/** Ticks per day / per year (mirror of plants::DAY_LEN and plants::YEAR_LEN). */
export const DAY_LEN = 600
export const YEAR_LEN = DAY_LEN * 12

export type RGB = [number, number, number]

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]

export interface SkyState {
  /** Unit vector towards the sun (x east->west over the day, y up, z a fixed tilt). */
  sunDir: [number, number, number]
  /** Sun height: 1 at noon, 0 at sunrise/sunset, -1 at midnight. */
  elevation: number
  /** 0 at night .. 1 in full daylight (smooth around the horizon). */
  day: number
  /** Warm-light amount near sunrise and sunset (0..1). */
  dusk: number
  horizon: RGB
  zenith: RGB
  /** Colour of the main light (sun by day, moon by night) and its intensity. */
  lightColor: RGB
  lightIntensity: number
  ambientSky: RGB
  ambientGround: RGB
  ambientIntensity: number
}

/** Clock -> sky. Day length matches the engine: noon at tick 300 (mod 600), midnight at tick 0. */
export function skyAt(tick: number): SkyState {
  const p = (((tick % DAY_LEN) + DAY_LEN) % DAY_LEN) / DAY_LEN // 0..1 over the day
  const a = (p - 0.25) * 2 * Math.PI
  const elevation = Math.sin(a)
  const east = Math.cos(a) // +1 at sunrise (east, +x) -> -1 at sunset
  const len = Math.hypot(east * 0.85, elevation, 0.35)
  const sunDir: [number, number, number] = [(east * 0.85) / len, elevation / len, 0.35 / len]

  const day = smoothstep(-0.12, 0.28, elevation)
  const dusk = Math.exp(-(((elevation - 0.04) / 0.2) ** 2)) // peaks when the sun is at the horizon

  const nightH = hex(0x0b1630)
  const nightZ = hex(0x01040b)
  const dayH = hex(0xc4dcf0)
  const dayZ = hex(0x4a84c6)
  const duskH = hex(0xf5a263)
  const duskZ = hex(0x3b4f86)
  let horizon = mix(nightH, dayH, day)
  let zenith = mix(nightZ, dayZ, day)
  horizon = mix(horizon, duskH, dusk * 0.85)
  zenith = mix(zenith, duskZ, dusk * 0.5)

  // by day the sun lights the world (warm when low); by night a pale blue moon does
  const sunColor = mix(hex(0xfff3dc), hex(0xffb070), dusk)
  const moonColor = hex(0x9fb8ff)
  const lightColor = mix(moonColor, sunColor, day)
  const lightIntensity = 0.28 + 1.05 * day * (0.55 + 0.45 * Math.max(elevation, 0))
  return {
    sunDir,
    elevation,
    day,
    dusk,
    horizon,
    zenith,
    lightColor,
    lightIntensity,
    ambientSky: mix(hex(0x1a2a50), hex(0xaed0f2), day),
    ambientGround: mix(hex(0x070b10), hex(0x4d5a3a), day),
    ambientIntensity: 0.32 + 0.38 * day,
  }
}
