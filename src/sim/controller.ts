/** Drives the WASM engine (loop, speed, frames). Independent of the Worker so it stays testable. */
import { GENOME_LEN, TRAIT_LEN, Trait, biomeView, creatureView, grassView, type LifeExports } from './engine'
import { hiddenCount } from './brain'
import { intelligenceIndex } from './intelligence'
import { restoreSnapshot, takeSnapshot } from './snapshot'
import { CATCHUP_MAX_MS, CATCHUP_MAX_TICKS, TICK_RATE, type Frame, type Speed } from './protocol'

export const GRASS_EVERY = 10 // one frame in N carries the grass
export const IQ_EVERY = 15 // the (costly) intelligence index is only recomputed every N frames

export class SimController {
  speed: Speed = 1
  selectedId: number | null = null
  private frames = 0
  // slow statistics (recomputed every IQ_EVERY frames): intelligence index and mean herbivore body plan
  private iq: { herb: number | null; carn: number | null; body: Frame['bodyHerbivores']; kinds: Frame['kindsHerbivores'] } = {
    herb: null,
    carn: null,
    body: null,
    kinds: null,
  }
  private catchup: { total: number; done: number; startedAt: number; maxMs: number } | null = null

  constructor(readonly engine: LifeExports) {}

  init(seed: number, w: number, h: number, herbivores: number, carnivores: number) {
    const e = this.engine
    if (e.world_init(seed, w, h) !== 0) throw new Error('invalid world dimensions')
    e.world_populate(0, herbivores)
    e.world_populate(1, carnivores)
    this.frames = 0
  }

  get catchingUp() {
    return this.catchup !== null
  }

  /** Prepares catching up `elapsedMs` of real time (capped); returns the target number of ticks. */
  beginCatchup(elapsedMs: number, now: () => number = () => performance.now()): number {
    const total = Math.min(CATCHUP_MAX_TICKS, Math.floor((Math.max(0, elapsedMs) / 1000) * TICK_RATE))
    this.catchup = total > 0 ? { total, done: 0, startedAt: now(), maxMs: CATCHUP_MAX_MS } : null
    return total
  }

  /**
   * Advances the catch-up by a slice of `sliceMs`. Finishes when all ticks are done,
   * when the maximum time is reached, or when the world is empty.
   */
  stepCatchup(sliceMs: number, now: () => number = () => performance.now()) {
    const c = this.catchup
    if (!c) return { done: 0, total: 0, finished: true }
    const start = now()
    while (c.done < c.total) {
      this.engine.tick()
      c.done++
      if ((c.done & 31) === 0) {
        const t = now()
        if (t - start > sliceMs || t - c.startedAt > c.maxMs) break
      }
    }
    const finished = c.done >= c.total || now() - c.startedAt > c.maxMs || this.engine.creature_count() === 0
    const res = { done: c.done, total: c.total, finished }
    if (finished) this.catchup = null
    return res
  }

  skipCatchup() {
    this.catchup = null
  }

  /** Resumes a save; false (world unchanged or empty) if it is invalid. */
  restore(data: Uint8Array): boolean {
    const ok = restoreSnapshot(this.engine, data)
    if (ok) this.frames = 0
    return ok
  }

  snapshot() {
    return { data: takeSnapshot(this.engine), meta: { tick: this.engine.world_tick(), seed: this.engine.world_seed() >>> 0 } }
  }

  /** Copy of the biomes (sent once to the UI). */
  terrain() {
    return { w: this.engine.world_width(), h: this.engine.world_height(), biome: biomeView(this.engine).slice() }
  }

  /** Runs up to `speed` ticks without exceeding `budgetMs`; returns the number of ticks done. */
  advance(budgetMs: number, now: () => number = () => performance.now()): number {
    const start = now()
    let done = 0
    while (done < this.speed) {
      this.engine.tick()
      done++
      if (now() - start > budgetMs) break
    }
    return done
  }

  /** Details of the selected creature (null if none or dead). */
  inspect(): Frame['selected'] {
    if (this.selectedId === null) return null
    const e = this.engine
    const i = creatureView(e, 'id').indexOf(this.selectedId)
    if (i < 0) return null
    const genome = creatureView(e, 'genome').slice(i * GENOME_LEN, (i + 1) * GENOME_LEN)
    return {
      id: this.selectedId,
      x: creatureView(e, 'x')[i]!,
      y: creatureView(e, 'y')[i]!,
      energy: creatureView(e, 'energy')[i]!,
      age: creatureView(e, 'age')[i]!,
      generation: creatureView(e, 'generation')[i]!,
      species: creatureView(e, 'species')[i]!,
      hidden: hiddenCount(genome),
      signal: creatureView(e, 'signal')[i]!,
      genome,
      traits: {
        size: creatureView(e, 'traits')[i * TRAIT_LEN + Trait.Size]!,
        speed: creatureView(e, 'traits')[i * TRAIT_LEN + Trait.Speed]!,
        vision: creatureView(e, 'traits')[i * TRAIT_LEN + Trait.Vision]!,
        hue: creatureView(e, 'traits')[i * TRAIT_LEN + Trait.Hue]!,
      },
    }
  }

  /** Current frame (copies: WASM views would be invalidated if memory grew). */
  frame(): Frame {
    const e = this.engine
    if (this.frames % IQ_EVERY === 0) this.iq = this.computeIq()
    const withGrass = this.frames++ % GRASS_EVERY === 0
    return {
      tick: e.world_tick(),
      season: e.world_season(),
      daylight: e.world_daylight(),
      count: e.creature_count(),
      herbivores: e.stats_count(0),
      carnivores: e.stats_count(1),
      hiddenHerbivores: e.stats_mean_hidden(0),
      hiddenCarnivores: e.stats_mean_hidden(1),
      rescues: e.world_rescues(),
      iqHerbivores: this.iq.herb,
      iqCarnivores: this.iq.carn,
      bodyHerbivores: this.iq.body,
      kindsHerbivores: this.iq.kinds,
      x: creatureView(e, 'x').slice(),
      y: creatureView(e, 'y').slice(),
      angle: creatureView(e, 'angle').slice(),
      energy: creatureView(e, 'energy').slice(),
      species: creatureView(e, 'species').slice(),
      signal: creatureView(e, 'signal').slice(),
      size: this.traitColumn(Trait.Size),
      hue: this.traitColumn(Trait.Hue),
      id: creatureView(e, 'id').slice(),
      selected: this.inspect(),
      grass: withGrass ? grassView(e).slice() : null,
    }
  }

  /** One physical trait of every creature, as a flat array (the traits are stored interleaved). */
  private traitColumn(k: number): Float32Array {
    const t = creatureView(this.engine, 'traits')
    const n = this.engine.creature_count()
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) out[i] = t[i * TRAIT_LEN + k]!
    return out
  }

  private computeIq() {
    const e = this.engine
    const of = (species: number) => (e.stats_count(species) > 0 ? intelligenceIndex(e.stats_competence(species)) : null)
    const body =
      e.stats_count(0) > 0
        ? { size: e.stats_mean_trait(0, Trait.Size), speed: e.stats_mean_trait(0, Trait.Speed), vision: e.stats_mean_trait(0, Trait.Vision) }
        : null
    const kinds =
      e.stats_count(0) > 0 ? { bump: e.stats_kind_share(0, 1), step: e.stats_kind_share(0, 2), wave: e.stats_kind_share(0, 3) } : null
    return { herb: of(0), carn: of(1), body, kinds }
  }

  spawn(x: number, y: number, species: number, count: number) {
    for (let i = 0; i < count; i++) {
      const jx = x + ((i * 7) % 5) * 0.3 - 0.6
      const jy = y + ((i * 11) % 5) * 0.3 - 0.6
      if (this.engine.creature_spawn(jx, jy, species) < 0) break
    }
  }

  meteor(x: number, y: number, r: number) {
    return this.engine.world_meteor(x, y, r)
  }

  bless(x: number, y: number, r: number) {
    return this.engine.world_bless(x, y, r)
  }

  rain(value: number) {
    this.engine.world_set_rain(value)
  }
}
