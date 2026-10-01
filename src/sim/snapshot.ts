/**
 * Sérialisation binaire de l'état du monde (persistance navigateur).
 * Format : en-tête de 32 octets (little-endian) puis altitude f32, biome u8, herbe f32.
 */
import { CREATURE_FIELDS, altitudeView, biomeView, grassView, type LifeExports } from './engine'

export const SNAPSHOT_MAGIC = 0x4c494645 // « LIFE »
export const SNAPSHOT_VERSION = 2
const HEADER = 32

export function takeSnapshot(e: LifeExports): Uint8Array {
  const w = e.world_width()
  const h = e.world_height()
  const n = w * h
  const nc = e.creature_count()
  const creatureBytes = CREATURE_FIELDS.reduce((a, f) => a + f.size * nc, 0)
  const out = new Uint8Array(HEADER + n * 9 + 8 + creatureBytes)
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
  // section créatures : count, next_id, puis chaque champ SoA (nc éléments)
  let off = HEADER + n * 9
  dv.setUint32(off, nc, true)
  dv.setUint32(off + 4, e.creature_next_id(), true)
  off += 8
  for (const f of CREATURE_FIELDS) {
    out.set(new Uint8Array(e.memory.buffer, e[f.ptr](), nc * f.size), off)
    off += nc * f.size
  }
  return out
}

/** Restaure un snapshot ; renvoie false si le format est invalide ou incompatible. */
export function restoreSnapshot(e: LifeExports, data: Uint8Array): boolean {
  if (data.length < HEADER) return false
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (dv.getUint32(0, true) !== SNAPSHOT_MAGIC || dv.getUint32(4, true) !== SNAPSHOT_VERSION) return false
  const w = dv.getUint32(12, true)
  const h = dv.getUint32(16, true)
  const n = w * h
  if (n === 0 || data.length < HEADER + n * 9 + 8) return false
  const nc = dv.getUint32(HEADER + n * 9, true)
  const creatureBytes = CREATURE_FIELDS.reduce((a, f) => a + f.size * nc, 0)
  if (data.length !== HEADER + n * 9 + 8 + creatureBytes) return false
  // world_init valide les dimensions et prépare la mémoire ; on écrase ensuite les couches.
  if (e.world_init(dv.getUint32(8, true), w, h) !== 0) return false
  new Uint8Array(altitudeView(e).buffer, altitudeView(e).byteOffset, n * 4).set(data.subarray(HEADER, HEADER + n * 4))
  biomeView(e).set(data.subarray(HEADER + n * 4, HEADER + n * 5))
  const g = grassView(e)
  new Uint8Array(g.buffer, g.byteOffset, n * 4).set(data.subarray(HEADER + n * 5, HEADER + n * 9))
  if (e.world_restore(dv.getUint32(8, true), w, h, dv.getUint32(20, true), dv.getFloat32(24, true)) !== 0) return false
  if (e.creatures_restore(nc, dv.getUint32(HEADER + n * 9 + 4, true)) !== 0) return false
  let off = HEADER + n * 9 + 8
  for (const f of CREATURE_FIELDS) {
    new Uint8Array(e.memory.buffer, e[f.ptr](), nc * f.size).set(data.subarray(off, off + nc * f.size))
    off += nc * f.size
  }
  return true
}
