/**
 * Lineage colours: each species has a base hue, shifted by the creature's heritable hue gene
 * (0..1, see wasm/src/traits.rs), so families become visible on the map. Shared by the 2D and 3D renderers.
 */

/** Base hue (0..1 on the colour wheel) and spread of the lineage shift, per species. */
const SPECIES_HUE = [
  { base: 0.17, spread: 0.24 }, // herbivores: orange .. yellow .. lime
  { base: 0.97, spread: 0.14 }, // carnivores: violet .. red .. orange-red
]

/** HSL -> RGB (all components in 0..1). */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 1) + 1) % 1
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + hue * 12) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [f(0), f(8), f(4)]
}

/** Lineage colour of a creature as RGB in 0..1. */
export function lineageRgb(species: number, hue: number): [number, number, number] {
  const sp = SPECIES_HUE[species] ?? SPECIES_HUE[0]!
  return hslToRgb(sp.base + (hue - 0.5) * sp.spread, 0.92, 0.58)
}

/** Same colour as a CSS string (for swatches in the UI). */
export function lineageCss(species: number, hue: number): string {
  const [r, g, b] = lineageRgb(species, hue)
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
}
