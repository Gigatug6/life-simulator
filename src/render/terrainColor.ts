/** Terrain colours (mirror of the biomes in wasm/src/world.rs). */
import { Biome } from '../sim/engine'

type RGB = [number, number, number]
const hex = (h: number): RGB => [(h >> 16) & 255, (h >> 8) & 255, h & 255]

const DEEP = hex(0x1b3a63)
const SHALLOW = hex(0x2f6f9a)
const BEACH = hex(0xd9c88c)
const PLAIN_DRY = hex(0x9a8f4e)
const PLAIN_LUSH = hex(0x4fae3a)
const FOREST_DRY = hex(0x3d5a2a)
const FOREST_LUSH = hex(0x1f7a30)
const MOUNTAIN = hex(0x7d7a75)

/** Grass capacity per biome (mirror of plants::capacity), used to normalize the grass. */
export const CAPACITY = [0, 0, 0.1, 1, 0.8, 0.15]

const mix = (a: RGB, b: RGB, t: number, out: Uint8ClampedArray, o: number) => {
  out[o] = a[0] + (b[0] - a[0]) * t
  out[o + 1] = a[1] + (b[1] - a[1]) * t
  out[o + 2] = a[2] + (b[2] - a[2]) * t
  out[o + 3] = 255
}

/** Writes the RGBA colour of a cell into `out[o..o+4]`. */
export function terrainColor(biome: number, grass: number, out: Uint8ClampedArray, o: number) {
  const cap = CAPACITY[biome] ?? 0
  const t = cap > 0 ? Math.min(1, grass / cap) : 0
  switch (biome) {
    case Biome.DeepWater: return mix(DEEP, DEEP, 0, out, o)
    case Biome.ShallowWater: return mix(SHALLOW, SHALLOW, 0, out, o)
    case Biome.Beach: return mix(BEACH, PLAIN_DRY, t * 0.6, out, o)
    case Biome.Plain: return mix(PLAIN_DRY, PLAIN_LUSH, t, out, o)
    case Biome.Forest: return mix(FOREST_DRY, FOREST_LUSH, t, out, o)
    default: return mix(MOUNTAIN, FOREST_DRY, t * 0.5, out, o)
  }
}
