# PROGRESS — Simulateur de vie

## Statut
- Phase courante : 2 — Créatures
- Commandes : `make init`, `make install`, `make wasm`, `make check`, `make dev`, `make e2e`

## Checklist
### Phase 0 — Infra
- [x] 0.1 Docker + compose + scripts + Makefile
- [x] 0.2 Squelette Vue/TS/Vite + Vitest
- [x] 0.3 WASM « hello » (Rust, Docker) chargé dans un worker
- [x] 0.4 Playwright smoke
### Phase 1 — Noyau WASM (RNG, grille, biomes, plantes/saisons)
- [x] 1.1 RNG xorshift + monde (altitude, biomes) + pont TS (`biomeView`, `altitudeView`)
- [x] 1.2 Plantes : couche d'herbe (repousse logistique selon fertilité/biome), saisons, jour/nuit, pluie
- [x] 1.3 Snapshot mémoire du monde (sérialisation/restauration en octets) pour la persistance
### Phase 2 — Créatures (SoA, spatial hash, cerveau, mutation)
- [x] 2.1 Stockage SoA des créatures (x, y, angle, énergie, âge, espèce, génération), spawn/kill, export des positions, snapshot étendu
- [x] 2.2 Spatial hash (grille de voisinage) + test de requête
- [x] 2.3 Cerveau : MLP feed-forward (poids = génome), entrées (vision herbe/eau/voisins/énergie), sorties (avance, rotation, manger, reproduire)
- [x] 2.4a Génomes SoA (185 f32/créature), RNG global sérialisé dans le snapshot
- [x] 2.4b Dynamique : déplacement, métabolisme, manger l'herbe, mort, reproduction avec mutation, déterminisme
- [ ] 2.5 Carnivores/prédation + équilibre de base (simulation headless : population ne s'éteint pas)
### Phase 3 — Worker + rendu three.js instancié
### Phase 4 — Persistance IndexedDB + rattrapage hors-ligne
### Phase 5 — Mode Dieu & UI
### Phase 6 — Intelligence avancée (structure évolutive, apprentissage, paliers)
### Phase 7 — Finitions

## Prochaine étape
Phase 2.5 : carnivores (prédation : capteurs de proies, attaque/gain d'énergie) + équilibrage par simulation headless (`cargo test` long ou export de stats `stats_*` : population par espèce, hidden moyen). Vérifier que la population herbivore ne sature pas à MAX ni ne s'éteint, régler les constantes de `life.rs`.

## Décisions
- Stack identique à potato-cutter (Vue 3, Pinia, Vite 8, TS 5.9, three, Vitest, Playwright, Docker).
- WASM en Rust no_std sans crate ni wasm-bindgen ; snapshots transférables (pas de SharedArrayBuffer).
- Persistance : IndexedDB uniquement, pas d'API.

## Blocages
(aucun)

## Journal
- 2.4b fait : life.rs (sin/cos approchés, perception 10 entrées, décision MLP, déplacement bloqué par l'eau profonde, métabolisme avec coût par unité cachée, manger, mort, reproduction mutée), branché dans `tick` avec spatial hash. cargo 23 + Vitest 7 (dont reprise identique après restauration avec créatures). À surveiller en 2.5 : le test de restauration (200 créatures, 300 ticks) prend ~3 s → la population semble gonfler fortement (probable saturation), équilibrage nécessaire.
- 2.4a fait : génomes stockés dans le SoA (`creature_genome_ptr`, kill copie le génome), RNG global (`rng_lo/hi/restore`) inclus dans le snapshot (section créatures = 16 octets d'en-tête), `GENOME_LEN` miroir TS vérifié par test. Tests Rust : Creatures alloué via `Box::new_zeroed` (15 Mo, pas sur la pile). cargo 20 + Vitest 6 verts.
- 2.3 fait : brain.rs (MLP 10→≤12→4, tanh de Padé sans exp, génome plat de 185 f32 dont le nombre d'unités cachées est un gène muté ±1 → complexité évolutive, mutation gaussienne Irwin-Hall). cargo 20 verts. Mémoire : 185 f32 × 20 000 créatures ≈ 15 Mo une fois les génomes stockés (2.4a).
- 2.2 fait : spatial.rs (grille 8×8, tri par comptage, `query` à callback), test contre force brute (3000 points, 50 requêtes) + bords/vide. cargo 16 verts. Pas encore branché dans tick (viendra en 2.4).
- 2.1 fait : creatures.rs (SoA 20 000, kill par échange, id stables), exports `creature_*`, `CREATURE_FIELDS` côté TS, snapshot v2 (section créatures). cargo 14 + Vitest 6 verts.
- 1.3 fait : `world_seed/tick/rain/restore` + `src/sim/snapshot.ts` (format versionné « LIFE », en-tête 32 o + couches), test aller-retour identique après 200 ticks. Phase 1 terminée. Décision : la sérialisation est côté TS (zéro copie via vues mémoire) ; le Rust ne fait que restaurer les méta-données.
- 1.2 fait : plants.rs (herbe logistique, capacité par biome, saisons, jour/nuit en ondes triangulaires sans sin), pluie divine `world_set_rain`, tick() met à jour l'herbe (1 cellule sur 4). cargo 11 + Vitest 3 verts. Bug corrigé : daylight avait un déphasage de 0,25.
- 1.1 fait : rng.rs, world.rs (bruit de valeurs 4 octaves + île + biomes), exports `world_*`, tests cargo (7) + Vitest (2) verts.
- Phase 0 terminée : `make check` (cargo test + typecheck + vitest + build) et `make e2e` (smoke WASM dans worker) verts. Correction : `no_std`/panic_handler conditionnés à `target_arch = "wasm32"` pour que `cargo test` fonctionne.
