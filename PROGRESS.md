# PROGRESS — Simulateur de vie

## Statut
- Phase courante : 4 — Persistance
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
- [x] 2.5 Carnivores/prédation + équilibre de base (simulation headless : population ne s'éteint pas)
### Phase 3 — Worker + rendu three.js instancié
- [x] 3.1 Protocole worker : boucle fixe (vitesse pause/×1/×4/×16/×64), snapshots transférables (positions, espèce, énergie) + commandes (init, spawn, pluie)
- [x] 3.2 Renderer three.js : caméra ortho, terrain en DataTexture (biomes + herbe + jour/nuit), zoom/pan
- [x] 3.3 Créatures en InstancedMesh (couleur par espèce/énergie), capture e2e relue
- [x] 3.4 Équilibrage du démarrage : pas de boom (400→6000 en 75 ticks), population stable ; l'herbe doit limiter la croissance
### Phase 4 — Persistance IndexedDB + rattrapage hors-ligne
- [ ] 4.1 `src/persist/store.ts` : interface `SaveStore` + implémentation IndexedDB (une base `life-simulator`, store `saves`, clé `main`, + `meta`) + implémentation mémoire pour les tests unitaires
- [ ] 4.2 Worker : commandes `save`/`load` (takeSnapshot/restoreSnapshot), autosave toutes les ~10 s et sur `visibilitychange`/`pagehide`, reprise au démarrage (sinon nouveau monde)
- [ ] 4.3 Rattrapage hors-ligne : temps écoulé depuis la dernière sauvegarde simulé en rafale (ticks sans rendu, plafonné ~5 min de calcul), barre de progression
- [ ] 4.4 Export/import fichier + bouton « Nouveau monde » (graine), e2e « recharge la page → même monde »
### Phase 5 — Mode Dieu & UI
### Phase 6 — Intelligence avancée (structure évolutive, apprentissage, paliers)
### Phase 7 — Finitions

## Prochaine étape
Phase 4.1 : `src/persist/store.ts` — interface `SaveStore` (get/put/delete d'un `Uint8Array` + méta `{savedAt, tick, seed}`), implémentation IndexedDB (try/catch partout, repli si indisponible), implémentation mémoire ; tests Vitest sur l'implémentation mémoire + test e2e IndexedDB réel.

## Décisions
- Stack identique à potato-cutter (Vue 3, Pinia, Vite 8, TS 5.9, three, Vitest, Playwright, Docker).
- WASM en Rust no_std sans crate ni wasm-bindgen ; snapshots transférables (pas de SharedArrayBuffer).
- Persistance : IndexedDB uniquement, pas d'API.

## Blocages
(aucun)

## Journal
- 3.4 fait : naissance moins facile (enfant 25 < coût 45 : plus d'énergie créée, maturité 300 ticks). Résultats `balance_report` : herbivores seuls 600→900 puis lente décrue vers ~150 (6000 ticks) ; avec carnivores oscillations Lotka-Volterra ~5000 ticks puis effondrement. Test anti-boom (max < 2500). ATTENTION objectif central : l'intelligence moyenne (hidden ≈ 4,0) ne monte pas encore → priorité phase 6 (pression de sélection, apprentissage, mutations structurelles plus utiles). Phase 3 terminée.
- 3.3 fait : `render/instances.ts` (matrices + couleurs, taille ≥ 4 px), InstancedMesh 20 000 triangles orientés dans `Renderer.setCreatures` (réupload au changement de zoom). Capture relue : triangles jaunes (herbivores) et rouges (carnivores), orientés, visibles au dézoom comme au zoom. Problème visible : 6000 herbivores à t=75, ticks/s chute (128) → étape 3.4. Vitest 18 + e2e 2 verts.
- 3.2 fait : `render/view.ts` (ViewState pur : fit/pan/zoom au curseur/bornes), `render/terrainColor.ts` (biome + herbe → couleur), `render/Renderer.ts` (three ortho, DataTexture NearestFilter, molette, glisser, pinch, jour/nuit via color du matériau, dispose), `WorldView.vue`. Captures `artifacts/screens/world-fit.png`/`world-zoom.png` relues : île avec eau profonde/peu profonde, plages, plaines, forêts, montagnes grises, zones brunes broutées ; zoom OK. Observation : 400 herbivores → 4400 en 62 ticks (reproduction trop facile au démarrage), ~435-770 ticks/s avec 4000 créatures. Vitest 16 + e2e 2 verts.
- 3.1 fait : `SimController` (testable sans Worker : init/peuplement `world_populate`, `advance` avec budget temps, `frame` en copies, spawn, pluie), worker mince (33 ms/image, budget 22 ms), protocole typé + `SPEEDS`, store Pinia `world` (tableaux en shallowRef/markRaw), App de debug avec boutons de vitesse. Vitest 11 + e2e smoke (vitesse ×16, pause fige les ticks) verts.
- 2.5 fait : carnivores (capteurs de proies, frappe à 1,6, gain 50 % de l'énergie de la proie, métabolisme ×1,6), `stats_count`/`stats_mean_hidden`, test d'équilibre herbivores (ni extinction ni saturation sur 3000 ticks), test de prédation, rapport `balance_report` (ignoré : `cargo test balance_report -- --ignored --nocapture`, `CARN=n`). `[profile.test] opt-level=3`. Réglage : BRAIN_COST 0.004→0.0008 (sinon la sélection réduisait les cerveaux). Observations : herbivores seuls ≈ 200-500 individus stables ; avec carnivores la pression de prédation fait monter les unités cachées des herbivores (4→6) mais les carnivores s'éteignent après un pic → à rééquilibrer en phase 6. Phase 2 terminée.
- 2.4b fait : life.rs (sin/cos approchés, perception 10 entrées, décision MLP, déplacement bloqué par l'eau profonde, métabolisme avec coût par unité cachée, manger, mort, reproduction mutée), branché dans `tick` avec spatial hash. cargo 23 + Vitest 7 (dont reprise identique après restauration avec créatures). À surveiller en 2.5 : le test de restauration (200 créatures, 300 ticks) prend ~3 s → la population semble gonfler fortement (probable saturation), équilibrage nécessaire.
- 2.4a fait : génomes stockés dans le SoA (`creature_genome_ptr`, kill copie le génome), RNG global (`rng_lo/hi/restore`) inclus dans le snapshot (section créatures = 16 octets d'en-tête), `GENOME_LEN` miroir TS vérifié par test. Tests Rust : Creatures alloué via `Box::new_zeroed` (15 Mo, pas sur la pile). cargo 20 + Vitest 6 verts.
- 2.3 fait : brain.rs (MLP 10→≤12→4, tanh de Padé sans exp, génome plat de 185 f32 dont le nombre d'unités cachées est un gène muté ±1 → complexité évolutive, mutation gaussienne Irwin-Hall). cargo 20 verts. Mémoire : 185 f32 × 20 000 créatures ≈ 15 Mo une fois les génomes stockés (2.4a).
- 2.2 fait : spatial.rs (grille 8×8, tri par comptage, `query` à callback), test contre force brute (3000 points, 50 requêtes) + bords/vide. cargo 16 verts. Pas encore branché dans tick (viendra en 2.4).
- 2.1 fait : creatures.rs (SoA 20 000, kill par échange, id stables), exports `creature_*`, `CREATURE_FIELDS` côté TS, snapshot v2 (section créatures). cargo 14 + Vitest 6 verts.
- 1.3 fait : `world_seed/tick/rain/restore` + `src/sim/snapshot.ts` (format versionné « LIFE », en-tête 32 o + couches), test aller-retour identique après 200 ticks. Phase 1 terminée. Décision : la sérialisation est côté TS (zéro copie via vues mémoire) ; le Rust ne fait que restaurer les méta-données.
- 1.2 fait : plants.rs (herbe logistique, capacité par biome, saisons, jour/nuit en ondes triangulaires sans sin), pluie divine `world_set_rain`, tick() met à jour l'herbe (1 cellule sur 4). cargo 11 + Vitest 3 verts. Bug corrigé : daylight avait un déphasage de 0,25.
- 1.1 fait : rng.rs, world.rs (bruit de valeurs 4 octaves + île + biomes), exports `world_*`, tests cargo (7) + Vitest (2) verts.
- Phase 0 terminée : `make check` (cargo test + typecheck + vitest + build) et `make e2e` (smoke WASM dans worker) verts. Correction : `no_std`/panic_handler conditionnés à `target_arch = "wasm32"` pour que `cargo test` fonctionne.
