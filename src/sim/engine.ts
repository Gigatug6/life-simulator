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
  world_meteor(x: number, y: number, r: number): number
  world_bless(x: number, y: number, r: number): number
  world_seed(): number
  world_tick(): number
  world_rain(): number
  world_restore(seed: number, w: number, h: number, tick: number, rain: number): number
  creature_spawn(x: number, y: number, species: number): number
  creature_kill(i: number): void
  creature_count(): number
  creature_next_id(): number
  creatures_restore(count: number, nextId: number): number
  creature_x_ptr(): number
  creature_y_ptr(): number
  creature_angle_ptr(): number
  creature_energy_ptr(): number
  creature_age_ptr(): number
  creature_id_ptr(): number
  creature_generation_ptr(): number
  creature_species_ptr(): number
  creature_genome_ptr(): number
  genome_len(): number
  learn_len(): number
  creature_learned_ptr(): number
  world_populate(species: number, count: number): number
  stats_count(species: number): number
  stats_mean_hidden(species: number): number
  stats_competence(species: number): number
  rng_lo(): number
  rng_hi(): number
  rng_restore(lo: number, hi: number): void
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

/** Longueur du génome en f32 (miroir de brain::GENOME_LEN ; vérifiée par un test). */
export const GENOME_LEN = 185
/** Deltas appris par créature (miroir de brain::LEARN_LEN). */
export const LEARN_LEN = 48

/** Champs SoA des créatures : nom, taille d'un élément, constructeur de vue, getter de pointeur. */
export const CREATURE_FIELDS = [
  { name: 'x', size: 4, ptr: 'creature_x_ptr', ctor: Float32Array },
  { name: 'y', size: 4, ptr: 'creature_y_ptr', ctor: Float32Array },
  { name: 'angle', size: 4, ptr: 'creature_angle_ptr', ctor: Float32Array },
  { name: 'energy', size: 4, ptr: 'creature_energy_ptr', ctor: Float32Array },
  { name: 'age', size: 4, ptr: 'creature_age_ptr', ctor: Uint32Array },
  { name: 'id', size: 4, ptr: 'creature_id_ptr', ctor: Uint32Array },
  { name: 'generation', size: 2, ptr: 'creature_generation_ptr', ctor: Uint16Array },
  { name: 'species', size: 1, ptr: 'creature_species_ptr', ctor: Uint8Array },
  { name: 'genome', size: GENOME_LEN * 4, ptr: 'creature_genome_ptr', ctor: Float32Array },
  { name: 'learned', size: LEARN_LEN * 4, ptr: 'creature_learned_ptr', ctor: Float32Array },
] as const

export type CreatureField = (typeof CREATURE_FIELDS)[number]['name']

/** Vue sur un champ des créatures vivantes (valide jusqu'à la prochaine croissance mémoire). */
interface CreatureViews {
  x: Float32Array
  y: Float32Array
  angle: Float32Array
  energy: Float32Array
  age: Uint32Array
  id: Uint32Array
  generation: Uint16Array
  species: Uint8Array
  genome: Float32Array
  learned: Float32Array
}

export function creatureView<K extends CreatureField>(e: LifeExports, name: K): CreatureViews[K] {
  const f = CREATURE_FIELDS.find((c) => c.name === name)!
  return new f.ctor(e.memory.buffer, e[f.ptr](), (e.creature_count() * f.size) / f.ctor.BYTES_PER_ELEMENT) as CreatureViews[K]
}
