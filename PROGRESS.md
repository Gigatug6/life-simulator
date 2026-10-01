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
### Phase 2 — Créatures (SoA, spatial hash, cerveau, mutation)
### Phase 3 — Worker + rendu three.js instancié
### Phase 4 — Persistance IndexedDB + rattrapage hors-ligne
### Phase 5 — Mode Dieu & UI
### Phase 6 — Intelligence avancée (structure évolutive, apprentissage, paliers)
### Phase 7 — Finitions

## Prochaine étape
Phase 1.1 : RNG xorshift déterministe + grille du monde (altitude par bruit de valeurs, biomes) en Rust, avec tests `cargo test` et test Vitest du pont.

## Décisions
- Stack identique à potato-cutter (Vue 3, Pinia, Vite 8, TS 5.9, three, Vitest, Playwright, Docker).
- WASM en Rust no_std sans crate ni wasm-bindgen ; snapshots transférables (pas de SharedArrayBuffer).
- Persistance : IndexedDB uniquement, pas d'API.

## Blocages
(aucun)

## Journal
- Phase 0 terminée : `make check` (cargo test + typecheck + vitest + build) et `make e2e` (smoke WASM dans worker) verts. Correction : `no_std`/panic_handler conditionnés à `target_arch = "wasm32"` pour que `cargo test` fonctionne.
