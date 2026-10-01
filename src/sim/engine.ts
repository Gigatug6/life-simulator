/** Charge le module WASM et expose son API typée. Aucune dépendance à Vue/Pinia. */
export interface LifeExports {
  version(): number
  tick(): number
  add(a: number, b: number): number
  world_init(seed: number, w: number, h: number): number
  world_width(): number
  world_height(): number
  world_altitude_ptr(): number
  world_biome_ptr(): number
  world_grass_ptr(): number
  world_season(): number
  world_daylight(): number
  world_set_rain(v: number): void
  memory: WebAssembly.Memory
}

export async function loadEngine(source: BufferSource | Response | Promise<Response>): Promise<LifeExports> {
  const result =
    source instanceof Response || source instanceof Promise
      ? await WebAssembly.instantiateStreaming(source, {})
      : await WebAssembly.instantiate(source, {})
  return result.instance.exports as unknown as LifeExports
}

/** Biomes (miroir de wasm/src/world.rs). */
export const Biome = { DeepWater: 0, ShallowWater: 1, Beach: 2, Plain: 3, Forest: 4, Mountain: 5 } as const

/** Vue sur les biomes du monde (valide jusqu'à la prochaine croissance de la mémoire WASM). */
export function biomeView(e: LifeExports): Uint8Array {
  return new Uint8Array(e.memory.buffer, e.world_biome_ptr(), e.world_width() * e.world_height())
}

export function altitudeView(e: LifeExports): Float32Array {
  return new Float32Array(e.memory.buffer, e.world_altitude_ptr(), e.world_width() * e.world_height())
}

export function grassView(e: LifeExports): Float32Array {
  return new Float32Array(e.memory.buffer, e.world_grass_ptr(), e.world_width() * e.world_height())
}
