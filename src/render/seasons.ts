/** Seasonal look of the terrain (snow, autumn foliage). Pure and testable. */
import { YEAR_LEN } from './sky'

export interface SeasonFactors {
  /** 0..1, peaks in the middle of autumn. */
  autumn: number
  /** 0..1, peaks in the middle of winter. */
  winter: number
}

/** Tent function of the position in the year (wrapping around), 1 at `centre`, 0 beyond `half`. */
const tent = (phase: number, centre: number, half: number) => {
  let d = Math.abs(phase - centre)
  d = Math.min(d, 1 - d)
  return Math.max(0, 1 - d / half)
}

/** Seasons follow the engine: spring [0, .25), summer [.25, .5), autumn [.5, .75), winter [.75, 1). */
export function seasonFactors(tick: number): SeasonFactors {
  const phase = (((tick % YEAR_LEN) + YEAR_LEN) % YEAR_LEN) / YEAR_LEN
  return { autumn: tent(phase, 0.625, 0.17), winter: tent(phase, 0.875, 0.17) }
}

/** Altitude above which snow settles: low in mid-winter, out of reach in summer. */
export const snowLine = (winter: number) => 0.7 - 0.24 * winter

/** Applies the season to an RGB colour (0..255 components) of a cell; mutates `rgb` in place. */
export function applySeason(rgb: Uint8ClampedArray | number[], o: number, biome: number, altitude: number, f: SeasonFactors) {
  const lerp = (c: number, target: number, t: number) => c + (target - c) * t
  // autumn: leaves turn orange on plains (3) and forests (4)
  if (f.autumn > 0 && (biome === 3 || biome === 4)) {
    const t = f.autumn * (biome === 4 ? 0.62 : 0.4)
    rgb[o] = lerp(rgb[o]!, 205, t)
    rgb[o + 1] = lerp(rgb[o + 1]!, 112, t)
    rgb[o + 2] = lerp(rgb[o + 2]!, 38, t)
  }
  // winter: snow on high ground (and a light frost on land), never on water
  if (f.winter > 0 && biome >= 2) {
    const line = snowLine(f.winter)
    const snow = Math.min(1, Math.max(0, (altitude - line) / 0.07)) * f.winter
    const frost = (biome >= 3 ? 0.28 : 0.15) * f.winter
    const t = Math.max(snow, frost)
    rgb[o] = lerp(rgb[o]!, 238, t)
    rgb[o + 1] = lerp(rgb[o + 1]!, 244, t)
    rgb[o + 2] = lerp(rgb[o + 2]!, 250, t)
  }
}
