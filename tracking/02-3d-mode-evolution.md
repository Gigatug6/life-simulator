# 02 — Mode 3D, évolution physique, nouveaux neurones, effets visuels (chat n°2)

> Chat du 2026-10-01. Statut : **en cours**. Précédent : [`01-initial-simulator.md`](01-initial-simulator.md).

## Objectif
Demande de l'utilisateur : « ajouter un **mode 3D**, ajouter des **évolutions physiques** aux créatures, des **nouveaux neurones**, des éléments qui donnent une **claque visuelle** » — en autonomie. Plus : un **dossier de suivi** avec un fichier par chat (ce dossier), indiqué dans le README et `CLAUDE.md`.

## Checklist
### S — Suivi
- [x] S.1 Dossier `tracking/` (convention, index, modèle), ancien `PROGRESS.md` archivé, README et `CLAUDE.md` mis à jour

- [x] S.2 Demande utilisateur : noms de dossiers/fichiers et **commentaires de code en anglais** (dossier `suivi` renommé `tracking/`, traduction de tous les commentaires et titres de tests ; l'UI reste en français)

### E — Évolution physique des créatures
- [x] E.1 Traits physiques héréditaires et mutables (taille, vitesse, vision, teinte de lignée) en Rust + snapshot v5 + inspecteur + rendu 2D
- [ ] E.2 Coûts/avantages des traits (grand = plus fort mais plus coûteux, etc.), mesure : les traits évoluent-ils ? (rapport headless) + courbes/statistiques

### N — Nouveaux neurones
- [ ] N.1 Nouveaux capteurs (danger/prédateurs proches, proies, voisins de même lignée), neurone de **mémoire** (récurrent) et sortie **signal lumineux** (bioluminescence), types d'activation évolutifs par neurone (tanh / gaussienne / seuil / sinus) — génome et snapshot v6
- [ ] N.2 Sondes de compétence mises à jour, mesure (l'intelligence monte-t-elle toujours ?), schéma du cerveau (inspecteur) avec les nouveaux neurones

### R — Mode 3D et effets visuels
- [ ] R.1 Interface commune de rendu (2D/3D), altitude envoyée à l'UI, bouton 2D/3D mémorisé
- [ ] R.2 Terrain 3D en relief, eau animée (shader), éclairage jour/nuit (soleil/lune, ciel, brume), caméra orbitale
- [ ] R.3 Créatures 3D instanciées (taille/teinte/forme selon les traits, posées sur le relief), sélection par clic (raycast)
- [ ] R.4 Végétation 3D (arbres des forêts, herbe), neige/saisons, ombres
- [ ] R.5 « Claque » : bloom, lucioles/bioluminescence la nuit, particules (pluie, météorite, bénédiction), traînées, ondes de choc
- [ ] R.6 Finitions : performances 3D, e2e + captures relues, README, mesures

## Prochaine étape
E.2 — mesurer si les traits évoluent vraiment (rapport headless : moyennes de taille/vitesse/vision/teinte au fil de 40 000 ticks, avec et sans carnivores), régler les coûts si un trait écrase les autres (dérive vers un bord), puis afficher les moyennes dans les courbes (nouveau graphique « Corps »).

## Décisions
- Un fichier de suivi **par chat**, dans `tracking/` (demande utilisateur). L'ancien `PROGRESS.md` devient `tracking/01-initial-simulator.md`.
- 3D avec three.js déjà présent (aucune nouvelle dépendance : `OrbitControls`, `EffectComposer`, `UnrealBloomPass` viennent de `three/examples`).
- Le mode 2D reste disponible (bascule 2D/3D).
- Langue (demande utilisateur) : dossiers, fichiers, code, commentaires et titres de tests en **anglais** ; interface et documentation en français. Le dossier initial `suivi/` a été renommé `tracking/`.

## Limites connues
- Les herbivores qui « renaissent » après une quasi-extinction reçoivent un corps de fondateur aléatoire : les traits évolués ne sont pas mémorisés dans la mémoire des élites (seul le génome du cerveau l'est).

## Journal
- E.1 fait : `wasm/src/traits.rs` (4 traits héréditaires : taille, vitesse, vision, teinte de lignée ; mutation multiplicative bornée 30 %/trait σ=6 %, teinte qui dérive et boucle ; `upkeep(size)=0.4+0.6·size`), `Rng::gauss` partagé avec `brain.rs`, SoA `traits` (copié par `kill`), coûts/avantages dans `life::step` : métabolisme ∝ taille, coût de vision (+0,3·base·(vision−1)), coût de déplacement ∝ taille·vitesse², bouchée et énergie max ∝ taille, seuil/coût/énergie d'enfant ∝ taille du parent, portée d'attaque +0,5·(taille−1). Fondateurs : corps ±10 % autour de 1, teinte aléatoire. Export `trait_len/creature_traits_ptr/stats_mean_trait`. TypeScript : snapshot **v5** (champ `traits`), `Frame.size/hue`, `Inspected.traits`, `render/creatureColor.ts` (teinte de lignée par espèce : herbivores orange→citron, carnivores violet→rouge, partagé 2D/3D), `instances.ts` (taille de corps + teinte), inspecteur (Taille/Vitesse/Vision/pastille de lignée). Tests : cargo 41 (dont compromis de coûts et héritage avec mutation), Vitest 39, e2e 12 verts ; capture `inspector.png` relue (×1.07 / ×1.06 / ×0.96 + pastille orange). Anciennes sauvegardes (v4) refusées → nouveau monde.
- S.2 fait : `suivi/` → `tracking/` (+ fichiers `01-initial-simulator.md`, `02-3d-mode-evolution.md`, références mises à jour) ; règle de langue ajoutée à `CLAUDE.md` (code, commentaires, noms de dossiers/fichiers et titres de tests en anglais ; UI et docs en français). Tous les commentaires de code et messages de test passés en anglais : Rust (`wasm/src`), TypeScript/Vue (`src`), tests e2e, scripts, Makefile, Dockerfiles, Caddyfile, workflows GitHub (y compris leurs `name:`). Laissés en français volontairement : texte affiché à l'utilisateur (libellés d'UI, noms des paliers d'intelligence, messages d'erreur affichés) et les sélecteurs e2e qui visent ces textes. Les titres de tests e2e ayant changé, les filtres `-g` d'avant ne correspondent plus. Vérifié : cargo 35, Vitest 36, e2e 12, `make pages-check` verts.
- S.1 fait : création de `tracking/` (README avec règles et index, `_modele.md`), `PROGRESS.md` → `tracking/01-initial-simulator.md` (déplacé avec `git mv`, historique conservé), fichier du chat n°2 créé.
