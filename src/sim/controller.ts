/** Pilote le moteur WASM (boucle, vitesse, images). Indépendant du Worker pour rester testable. */
import { biomeView, creatureView, grassView, type LifeExports } from './engine'
import { restoreSnapshot, takeSnapshot } from './snapshot'
import type { Frame, Speed } from './protocol'

export const GRASS_EVERY = 10 // une image sur N embarque l'herbe

export class SimController {
  speed: Speed = 1
  private frames = 0

  constructor(readonly engine: LifeExports) {}

  init(seed: number, w: number, h: number, herbivores: number, carnivores: number) {
    const e = this.engine
    if (e.world_init(seed, w, h) !== 0) throw new Error('dimensions du monde invalides')
    e.world_populate(0, herbivores)
    e.world_populate(1, carnivores)
    this.frames = 0
  }

  /** Reprend une sauvegarde ; false (monde inchangé ou vide) si elle est invalide. */
  restore(data: Uint8Array): boolean {
    const ok = restoreSnapshot(this.engine, data)
    if (ok) this.frames = 0
    return ok
  }

  snapshot() {
    return { data: takeSnapshot(this.engine), meta: { tick: this.engine.world_tick(), seed: this.engine.world_seed() } }
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

  /** Image courante (copies : les vues WASM seraient invalidées si la mémoire grandit). */
  frame(): Frame {
    const e = this.engine
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
      x: creatureView(e, 'x').slice(),
      y: creatureView(e, 'y').slice(),
      angle: creatureView(e, 'angle').slice(),
      energy: creatureView(e, 'energy').slice(),
      species: creatureView(e, 'species').slice(),
      grass: withGrass ? grassView(e).slice() : null,
    }
  }

  spawn(x: number, y: number, species: number, count: number) {
    for (let i = 0; i < count; i++) {
      const jx = x + ((i * 7) % 5) * 0.3 - 0.6
      const jy = y + ((i * 11) % 5) * 0.3 - 0.6
      if (this.engine.creature_spawn(jx, jy, species) < 0) break
    }
  }

  rain(value: number) {
    this.engine.world_set_rain(value)
  }
}
