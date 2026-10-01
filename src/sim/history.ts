/** Historique échantillonné de l'évolution (population, intelligence), borné en taille. */
export interface Sample {
  tick: number
  herbivores: number
  carnivores: number
  hiddenHerbivores: number
  hiddenCarnivores: number
}

export const MAX_POINTS = 600

export class History {
  points: Sample[] = []
  /** Écart minimal entre deux échantillons (ticks) ; double à chaque réduction. */
  every: number

  constructor(every = 60, readonly max = MAX_POINTS) {
    this.every = every
  }

  /** Ajoute l'échantillon si assez de ticks se sont écoulés depuis le dernier. */
  push(s: Sample): boolean {
    const last = this.points[this.points.length - 1]
    if (last && s.tick < last.tick) return false // monde recommencé ou remonté : ignoré
    if (last && s.tick - last.tick < this.every) return false
    this.points.push(s)
    if (this.points.length > this.max) {
      // on garde toute la chronologie en divisant la résolution par deux
      this.points = this.points.filter((_, i) => i % 2 === 0)
      this.every *= 2
    }
    return true
  }

  /** Oublie les points postérieurs à `tick` (sauvegarde plus ancienne que l'historique). */
  pruneAfter(tick: number) {
    this.points = this.points.filter((p) => p.tick <= tick)
  }

  clear() {
    this.points = []
  }

  toJSON() {
    return { every: this.every, points: this.points }
  }

  static fromJSON(raw: unknown, max = MAX_POINTS): History {
    const h = new History(60, max)
    const r = raw as { every?: unknown; points?: unknown } | null
    if (!r || typeof r.every !== 'number' || !Array.isArray(r.points)) return h
    const valid = (p: unknown): p is Sample =>
      !!p && typeof p === 'object' && ['tick', 'herbivores', 'carnivores', 'hiddenHerbivores', 'hiddenCarnivores'].every((k) => Number.isFinite((p as Record<string, unknown>)[k]))
    h.every = Math.max(1, r.every)
    h.points = r.points.filter(valid).slice(-max)
    return h
  }
}

const KEY = (seed: number) => `life-simulator:history:${seed}`

export function loadHistory(seed: number): History {
  try {
    const raw = localStorage.getItem(KEY(seed))
    return raw ? History.fromJSON(JSON.parse(raw)) : new History()
  } catch {
    return new History()
  }
}

export function saveHistory(seed: number, h: History) {
  try {
    localStorage.setItem(KEY(seed), JSON.stringify(h))
  } catch {
    // stockage plein ou indisponible : l'historique est un confort, pas une donnée critique
  }
}

export function forgetHistory(seed: number) {
  try {
    localStorage.removeItem(KEY(seed))
  } catch {
    /* rien */
  }
}
