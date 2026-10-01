/** Sauvegarde dans le navigateur uniquement (IndexedDB) — aucune API, aucun serveur. */

export interface SaveMeta {
  savedAt: number // Date.now()
  tick: number
  seed: number
}

export interface SaveRecord {
  data: Uint8Array
  meta: SaveMeta
}

export interface SaveStore {
  /** false si les données ne survivront pas au rechargement (repli mémoire). */
  readonly persistent: boolean
  load(): Promise<SaveRecord | null>
  save(data: Uint8Array, meta: SaveMeta): Promise<void>
  clear(): Promise<void>
}

/** Repli en mémoire (tests, navigation privée sans IndexedDB). */
export class MemoryStore implements SaveStore {
  readonly persistent = false
  private rec: SaveRecord | null = null
  async load() {
    return this.rec ? { data: this.rec.data.slice(), meta: { ...this.rec.meta } } : null
  }
  async save(data: Uint8Array, meta: SaveMeta) {
    this.rec = { data: data.slice(), meta: { ...meta } }
  }
  async clear() {
    this.rec = null
  }
}

const DB_NAME = 'life-simulator'
const STORE = 'saves'
const KEY = 'main'

export class IdbStore implements SaveStore {
  readonly persistent = true
  private db: Promise<IDBDatabase> | null = null

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponible'))
      req.onblocked = () => reject(new Error('IndexedDB bloquée'))
    })
    // si l'ouverture échoue, on pourra réessayer
    this.db.catch(() => (this.db = null))
    return this.db
  }

  private async run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error ?? new Error('transaction IndexedDB échouée'))
      tx.onabort = () => reject(tx.error ?? new Error('transaction IndexedDB annulée'))
    })
  }

  async load(): Promise<SaveRecord | null> {
    const v = (await this.run('readonly', (s) => s.get(KEY))) as Partial<SaveRecord> | undefined
    if (!v || !(v.data instanceof Uint8Array) || !v.meta) return null
    return { data: v.data, meta: v.meta }
  }

  async save(data: Uint8Array, meta: SaveMeta) {
    await this.run('readwrite', (s) => s.put({ data, meta }, KEY))
  }

  async clear() {
    await this.run('readwrite', (s) => s.delete(KEY))
  }
}

/** IndexedDB si disponible, sinon repli mémoire (jamais d'exception ici). */
export function createSaveStore(): SaveStore {
  try {
    if (typeof indexedDB !== 'undefined' && indexedDB) return new IdbStore()
  } catch {
    // accès refusé (certains modes privés) : repli
  }
  return new MemoryStore()
}
