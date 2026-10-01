/**
 * Binary serialization of the world state (browser persistence).
 * Format: 32-byte header (little-endian) then altitude f32, biome u8, grass f32.
 */
import { CREATURE_FIELDS, ELITE_SLOTS, GENOME_LEN, altitudeView, biomeView, grassView, type LifeExports } from './engine'

export const SNAPSHOT_MAGIC = 0x4c494645 // "LIFE"
export const SNAPSHOT_VERSION = 7
const HEADER = 32
/** "Elites" section: count + rescues (2 u32), f32 scores, f32 genomes. */
const ELITE_BYTES = 8 + ELITE_SLOTS * 4 + ELITE_SLOTS * GENOME_LEN * 4

export function takeSnapshot(e: LifeExports): Uint8Array {
  const w = e.world_width()
  const h = e.world_height()
  const n = w * h
  const nc = e.creature_count()
  const creatureBytes = CREATURE_FIELDS.reduce((a, f) => a + f.size * nc, 0)
  const out = new Uint8Array(HEADER + n * 9 + 16 + creatureBytes + ELITE_BYTES)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, SNAPSHOT_MAGIC, true)
  dv.setUint32(4, SNAPSHOT_VERSION, true)
  dv.setUint32(8, e.world_seed(), true)
  dv.setUint32(12, w, true)
  dv.setUint32(16, h, true)
  dv.setUint32(20, e.world_tick(), true)
  dv.setFloat32(24, e.world_rain(), true)
  out.set(new Uint8Array(altitudeView(e).buffer, altitudeView(e).byteOffset, n * 4), HEADER)
  out.set(biomeView(e), HEADER + n * 4)
  const g = grassView(e)
  out.set(new Uint8Array(g.buffer, g.byteOffset, n * 4), HEADER + n * 5)
  // creatures section: count, next_id, then each SoA field (nc elements)
  let off = HEADER + n * 9
  dv.setUint32(off, nc, true)
  dv.setUint32(off + 4, e.creature_next_id(), true)
  dv.setUint32(off + 8, e.rng_lo(), true)
  dv.setUint32(off + 12, e.rng_hi(), true)
  off += 16
  for (const f of CREATURE_FIELDS) {
    out.set(new Uint8Array(e.memory.buffer, e[f.ptr](), nc * f.size), off)
    off += nc * f.size
  }
  // elite memory (rebirth after extinction)
  dv.setUint32(off, e.elite_count(), true)
  dv.setUint32(off + 4, e.world_rescues(), true)
  off += 8
  out.set(new Uint8Array(e.memory.buffer, e.elite_scores_ptr(), ELITE_SLOTS * 4), off)
  off += ELITE_SLOTS * 4
  out.set(new Uint8Array(e.memory.buffer, e.elite_genomes_ptr(), ELITE_SLOTS * GENOME_LEN * 4), off)
  return out
}

/** Restores a snapshot; returns false if the format is invalid or incompatible. */
export function restoreSnapshot(e: LifeExports, data: Uint8Array): boolean {
  if (data.length < HEADER) return false
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (dv.getUint32(0, true) !== SNAPSHOT_MAGIC || dv.getUint32(4, true) !== SNAPSHOT_VERSION) return false
  const w = dv.getUint32(12, true)
  const h = dv.getUint32(16, true)
  const n = w * h
  if (n === 0 || data.length < HEADER + n * 9 + 16) return false
  const nc = dv.getUint32(HEADER + n * 9, true)
  const creatureBytes = CREATURE_FIELDS.reduce((a, f) => a + f.size * nc, 0)
  if (data.length !== HEADER + n * 9 + 16 + creatureBytes + ELITE_BYTES) return false
  // world_init validates the dimensions and prepares memory; the layers are then overwritten.
  if (e.world_init(dv.getUint32(8, true), w, h) !== 0) return false
  new Uint8Array(altitudeView(e).buffer, altitudeView(e).byteOffset, n * 4).set(data.subarray(HEADER, HEADER + n * 4))
  biomeView(e).set(data.subarray(HEADER + n * 4, HEADER + n * 5))
  const g = grassView(e)
  new Uint8Array(g.buffer, g.byteOffset, n * 4).set(data.subarray(HEADER + n * 5, HEADER + n * 9))
  if (e.world_restore(dv.getUint32(8, true), w, h, dv.getUint32(20, true), dv.getFloat32(24, true)) !== 0) return false
  if (e.creatures_restore(nc, dv.getUint32(HEADER + n * 9 + 4, true)) !== 0) return false
  e.rng_restore(dv.getUint32(HEADER + n * 9 + 8, true), dv.getUint32(HEADER + n * 9 + 12, true))
  let off = HEADER + n * 9 + 16
  for (const f of CREATURE_FIELDS) {
    new Uint8Array(e.memory.buffer, e[f.ptr](), nc * f.size).set(data.subarray(off, off + nc * f.size))
    off += nc * f.size
  }
  const eliteCount = dv.getUint32(off, true)
  const rescues = dv.getUint32(off + 4, true)
  off += 8
  new Uint8Array(e.memory.buffer, e.elite_scores_ptr(), ELITE_SLOTS * 4).set(data.subarray(off, off + ELITE_SLOTS * 4))
  off += ELITE_SLOTS * 4
  new Uint8Array(e.memory.buffer, e.elite_genomes_ptr(), ELITE_SLOTS * GENOME_LEN * 4).set(data.subarray(off, off + ELITE_SLOTS * GENOME_LEN * 4))
  return e.elites_restore(eliteCount, rescues) === 0
}

export interface SnapshotInfo {
  seed: number
  tick: number
  w: number
  h: number
  creatures: number
}

/** Reads a snapshot header without restoring it; null if the format is invalid. */
export function snapshotInfo(data: Uint8Array): SnapshotInfo | null {
  if (data.length < HEADER) return null
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (dv.getUint32(0, true) !== SNAPSHOT_MAGIC || dv.getUint32(4, true) !== SNAPSHOT_VERSION) return null
  const w = dv.getUint32(12, true)
  const h = dv.getUint32(16, true)
  const n = w * h
  if (n === 0 || n > 512 * 512 || data.length < HEADER + n * 9 + 16) return null
  const creatures = dv.getUint32(HEADER + n * 9, true)
  const perCreature = CREATURE_FIELDS.reduce((a, f) => a + f.size, 0)
  if (data.length !== HEADER + n * 9 + 16 + creatures * perCreature + ELITE_BYTES) return null
  return { seed: dv.getUint32(8, true), tick: dv.getUint32(20, true), w, h, creatures }
}
