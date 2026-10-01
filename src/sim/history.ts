/** Sampled history of the evolution (population, intelligence), bounded in size. */
export interface Sample {
  tick: number
  herbivores: number
  carnivores: number
  hiddenHerbivores: number
  hiddenCarnivores: number
  /** Intelligence index 0-100 (null: species absent, or data older than this field). */
  iqHerbivores?: number | null
  iqCarnivores?: number | null
  /** Mean herbivore body plan (size / speed / vision multipliers); null when absent or for older data. */
  body?: { size: number; speed: number; vision: number } | null
}

export const MAX_POINTS = 600

export class History {
  points: Sample[] = []
  /** Minimum gap between two samples (ticks); doubles on each downsampling. */
  every: number

  constructor(every = 60, readonly max = MAX_POINTS) {
    this.every = every
  }

  /** Adds the sample if enough ticks have elapsed since the last one. */
  push(s: Sample): boolean {
    const last = this.points[this.points.length - 1]
    if (last && s.tick < last.tick) return false // world restarted or rewound: ignored
    if (last && s.tick - last.tick < this.every) return false
    this.points.push(s)
    if (this.points.length > this.max) {
      // keep the whole timeline by halving the resolution
      this.points = this.points.filter((_, i) => i % 2 === 0)
      this.every *= 2
    }
    return true
  }

  /** Forgets the points after `tick` (save older than the history). */
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
    // storage full or unavailable: the history is a convenience, not critical data
  }
}

export function forgetHistory(seed: number) {
  try {
    localStorage.removeItem(KEY(seed))
  } catch {
    /* rien */
  }
}
