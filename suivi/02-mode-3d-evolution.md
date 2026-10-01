# 02 — Mode 3D, évolution physique, nouveaux neurones, effets visuels (chat n°2)

> Chat du 2026-10-01. Statut : **en cours**. Précédent : [`01-simulateur-initial.md`](01-simulateur-initial.md).

## Objectif
Demande de l'utilisateur : « ajouter un **mode 3D**, ajouter des **évolutions physiques** aux créatures, des **nouveaux neurones**, des éléments qui donnent une **claque visuelle** » — en autonomie. Plus : un **dossier de suivi** avec un fichier par chat (ce dossier), indiqué dans le README et `CLAUDE.md`.

## Checklist
### S — Suivi
- [x] S.1 Dossier `suivi/` (convention, index, modèle), ancien `PROGRESS.md` archivé, README et `CLAUDE.md` mis à jour

### E — Évolution physique des créatures
- [ ] E.1 Traits physiques héréditaires et mutables (taille, vitesse, vision, teinte de lignée) en Rust + snapshot v5 + inspecteur + rendu 2D
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
E.1 — traits physiques héréditaires.

## Décisions
- Un fichier de suivi **par chat**, dans `suivi/` (demande utilisateur). L'ancien `PROGRESS.md` devient `suivi/01-simulateur-initial.md`.
- 3D avec three.js déjà présent (aucune nouvelle dépendance : `OrbitControls`, `EffectComposer`, `UnrealBloomPass` viennent de `three/examples`).
- Le mode 2D reste disponible (bascule 2D/3D).

## Limites connues
(à compléter)

## Journal
- S.1 fait : création de `suivi/` (README avec règles et index, `_modele.md`), `PROGRESS.md` → `suivi/01-simulateur-initial.md` (déplacé avec `git mv`, historique conservé), fichier du chat n°2 créé.
