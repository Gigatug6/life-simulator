/** Pilote le moteur WASM (boucle, vitesse, images). Indépendant du Worker pour rester testable. */
import { GENOME_LEN, biomeView, creatureView, grassView, type LifeExports } from './engine'
import { hiddenCount } from './brain'
import { intelligenceIndex } from './intelligence'
import { restoreSnapshot, takeSnapshot } from './snapshot'
import { CATCHUP_MAX_MS, CATCHUP_MAX_TICKS, TICK_RATE, type Frame, type Speed } from './protocol'

export const GRASS_EVERY = 10 // une image sur N embarque l'herbe
export const IQ_EVERY = 15 // l'indice d'intelligence (coûteux) n'est recalculé que toutes les N images

export class SimController {
  speed: Speed = 1
  selectedId: number | null = null
  private frames = 0
  private iq: { herb: number | null; carn: number | null } = { herb: null, carn: null }
  private catchup: { total: number; done: number; startedAt: number; maxMs: number } | null = null

  constructor(readonly engine: LifeExports) {}

  init(seed: number, w: number, h: number, herbivores: number, carnivores: number) {
    const e = this.engine
    if (e.world_init(seed, w, h) !== 0) throw new Error('dimensions du monde invalides')
    e.world_populate(0, herbivores)
    e.world_populate(1, carnivores)
    this.frames = 0
  }

  get catchingUp() {
    return this.catchup !== null
  }

  /** Prépare le rattrapage de `elapsedMs` de temps réel (plafonné) ; renvoie le nombre de ticks visés. */
  beginCatchup(elapsedMs: number, now: () => number = () => performance.now()): number {
    const total = Math.min(CATCHUP_MAX_TICKS, Math.floor((Math.max(0, elapsedMs) / 1000) * TICK_RATE))
    this.catchup = total > 0 ? { total, done: 0, startedAt: now(), maxMs: CATCHUP_MAX_MS } : null
    return total
  }

  /**
   * Avance le rattrapage d'une tranche de `sliceMs`. Termine si tous les ticks sont faits,
   * si le temps maximal est atteint, ou si le monde est vide.
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

  /** Reprend une sauvegarde ; false (monde inchangé ou vide) si elle est invalide. */
  restore(data: Uint8Array): boolean {
    const ok = restoreSnapshot(this.engine, data)
    if (ok) this.frames = 0
    return ok
  }

  snapshot() {
    return { data: takeSnapshot(this.engine), meta: { tick: this.engine.world_tick(), seed: this.engine.world_seed() >>> 0 } }
  }

  /** Copie des biomes (envoyée une fois à l'UI). */
  terrain() {
    return { w: this.engine.world_width(), h: this.engine.world_height(), biome: biomeView(this.engine).slice() }
  }

  /** Exécute jusqu'à `speed` ticks sans dépasser `budgetMs` ; renvoie le nombre de ticks faits. */
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

  /** Détails de la créature sélectionnée (null si aucune ou morte). */
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
      genome,
    }
  }

  /** Image courante (copies : les vues WASM seraient invalidées si la mémoire grandit). */
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
      x: creatureView(e, 'x').slice(),
      y: creatureView(e, 'y').slice(),
      angle: creatureView(e, 'angle').slice(),
      energy: creatureView(e, 'energy').slice(),
      species: creatureView(e, 'species').slice(),
      id: creatureView(e, 'id').slice(),
      selected: this.inspect(),
      grass: withGrass ? grassView(e).slice() : null,
    }
  }

  private computeIq() {
    const e = this.engine
    const of = (species: number) => (e.stats_count(species) > 0 ? intelligenceIndex(e.stats_competence(species)) : null)
    return { herb: of(0), carn: of(1) }
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
