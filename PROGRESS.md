# PROGRESS — Simulateur de vie

## Statut
- Phase courante : 1 — Noyau WASM
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
- [ ] 1.3 Snapshot mémoire du monde (sérialisation/restauration en octets) pour la persistance
### Phase 2 — Créatures (SoA, spatial hash, cerveau, mutation)
### Phase 3 — Worker + rendu three.js instancié
### Phase 4 — Persistance IndexedDB + rattrapage hors-ligne
### Phase 5 — Mode Dieu & UI
### Phase 6 — Intelligence avancée (structure évolutive, apprentissage, paliers)
### Phase 7 — Finitions

## Prochaine étape
Phase 1.3 : snapshot mémoire du monde (octets : graine, tick, pluie, altitude, biome, herbe) — `world_snapshot_*` / `world_restore` en Rust, test aller-retour Vitest.

## Décisions
- Stack identique à potato-cutter (Vue 3, Pinia, Vite 8, TS 5.9, three, Vitest, Playwright, Docker).
- WASM en Rust no_std sans crate ni wasm-bindgen ; snapshots transférables (pas de SharedArrayBuffer).
- Persistance : IndexedDB uniquement, pas d'API.

## Blocages
(aucun)

## Journal
- 1.2 fait : plants.rs (herbe logistique, capacité par biome, saisons, jour/nuit en ondes triangulaires sans sin), pluie divine `world_set_rain`, tick() met à jour l'herbe (1 cellule sur 4). cargo 11 + Vitest 3 verts. Bug corrigé : daylight avait un déphasage de 0,25.
- 1.1 fait : rng.rs, world.rs (bruit de valeurs 4 octaves + île + biomes), exports `world_*`, tests cargo (7) + Vitest (2) verts.
- Phase 0 terminée : `make check` (cargo test + typecheck + vitest + build) et `make e2e` (smoke WASM dans worker) verts. Correction : `no_std`/panic_handler conditionnés à `target_arch = "wasm32"` pour que `cargo test` fonctionne.
