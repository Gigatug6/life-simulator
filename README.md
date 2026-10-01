# Simulateur de vie — vous êtes « Dieu »

Un monde virtuel de nature (eau, plages, plaines, forêts, montagnes, saisons, jour/nuit, pluie) peuplé de **milliers de petites bestioles** qui broutent, chassent, se reproduisent… et **deviennent plus intelligentes avec le temps**. Vous observez, et vous pouvez intervenir : semer des créatures, déclencher une météorite, bénir une région, faire pleuvoir ou sécher le monde.

- **Moteur** : Rust compilé en **WebAssembly** (sans crate externe), exécuté dans un Web Worker.
- **Rendu** : three.js (vue du ciel, créatures instanciées), Vue 3 + Pinia pour l'interface.
- **Aucune API, aucun serveur** : tout est sauvegardé dans le cache du navigateur (IndexedDB).
- **Rien n'est installé sur votre machine** : tout passe par Docker.

## Démarrage

```sh
make init      # génère .env (UID/GID) et construit les images
make install   # npm install dans Docker
make dev       # compile le moteur Rust -> WASM puis lance http://localhost:5173
```

Autres commandes :

| Commande | Rôle |
|---|---|
| `make check` | `cargo test` + typecheck + Vitest + build |
| `make e2e` | tests Playwright sur le serveur de dev |
| `make prod` | build de production servi par Caddy sur http://localhost:8080 |
| `make e2e-prod` | tests Playwright sur le build de production |
| `make pages-check` | teste le build GitHub Pages (sous-dossier `/life-simulator/`) |
| `make wasm` / `make wasm-test` | compiler / tester le moteur Rust seul |
| `make up` / `make down` | serveur de dev en arrière-plan / arrêt |

> Ne lancez jamais `node`, `npm` ou `cargo` directement sur l'hôte (voir `CLAUDE.md`).

## Jouer

- **Molette / glisser / pincer** : zoomer et déplacer la vue.
- **Barre du bas** (pouvoirs divins) : *Observer*, *Inspecter* (cliquez une créature : énergie, âge, génération et **schéma de son cerveau**), *Herbivores*, *Carnivores*, *Météorite*, *Bénédiction* (rayon réglable), puis *Pluie*, *Sécheresse*, *Beau temps*.
- **Barre du haut** : tick, saison, jour/nuit, **indice d'intelligence** (0-100 avec paliers : Errants, Fourrageurs, Stratèges, Sages), population, vitesse (pause, ×1 à ×64), *Courbes* (population et intelligence dans le temps) et *Menu* (sauvegarder, exporter/importer un fichier `.life`, nouveau monde).
- **Sauvegarde** : automatique toutes les 10 s (plus espacée pour un très gros monde), à la fermeture de l'onglet, et au rechargement le monde reprend là où il en était.
- **Le temps passe même onglet fermé** : à la reprise, le temps écoulé est simulé en rafale (plafonné à 60 s de calcul / 300 000 ticks, avec barre de progression et bouton *Passer*). Plus vous laissez le monde vivre, plus ses habitants sont intelligents.

## Comment les bestioles deviennent intelligentes

1. Chaque créature a un **cerveau** (réseau de neurones : 10 entrées → jusqu'à 12 neurones cachés → 4 sorties « avancer / tourner / manger-attaquer / se reproduire »). Ses **gènes** sont les poids du réseau, et le nombre de neurones cachés évolue aussi.
2. **Sélection naturelle** : manger exige de chercher (une bouchée ne nourrit que ~60 ticks), se reproduire demande de l'énergie accumulée ; les descendants héritent du génome **muté**.
3. **Apprentissage durant la vie** : règle hebbienne modulée par l'énergie gagnée sur la couche de sortie ; une fraction (25 %) de ce qui a été appris est transmise aux enfants.
4. **Mesure** : l'indice d'intelligence est la *compétence comportementale* moyenne (le cerveau tourne-t-il vers la nourriture, avance-t-il vers elle, évite-t-il l'eau, mange-t-il sur l'herbe ?). 0 = hasard, 100 = parfait.
5. **Renaissance** : si les herbivores s'éteignent presque, l'espèce repart de ses 8 meilleurs ancêtres mémorisés.

Résultats mesurés (monde 128², herbivores seuls, cf. `suivi/01-simulateur-initial.md`) : compétence 0,50 (hasard) → ~0,70 en 10 000 ticks. Les **carnivores** sont une pression ponctuelle : ils font monter l'intelligence des herbivores mais ne persistent pas durablement (Dieu peut en ressemer).

## Mettre en ligne sur GitHub Pages

Le site est 100 % statique (aucune API) : il peut être hébergé gratuitement par GitHub Pages. Le workflow `.github/workflows/deploy.yml` compile le moteur Rust en WebAssembly, teste, construit le site et le publie à chaque push sur `main` ou `master`.

1. Créez un dépôt GitHub vide, puis envoyez-y le code :
   ```sh
   git remote add origin git@github.com:<compte>/<depot>.git
   git push -u origin master
   ```
2. **Une seule fois**, sur GitHub : *Settings → Pages → Build and deployment → Source = « GitHub Actions »*.
3. Le workflow se lance tout seul (onglet *Actions*). Le site est ensuite disponible sur `https://<compte>.github.io/<depot>/`.

Détails : l'adresse de base est calculée automatiquement (sous-dossier `/<depot>/`, ou racine pour un dépôt `<compte>.github.io`). Pour un **domaine personnalisé**, définissez la variable de dépôt `CUSTOM_DOMAIN` (*Settings → Secrets and variables → Actions → Variables*). Le workflow `ci.yml` vérifie aussi chaque Pull Request. Chaque visiteur a **son propre monde**, sauvegardé dans son navigateur.

Tester le build GitHub Pages en local (sous-dossier) : `make pages-check`.

## Architecture

```
wasm/                  moteur Rust no_std (cdylib) : rng, world, plants, creatures (SoA 20 000),
                       spatial (grille de voisinage), brain (MLP + apprentissage), life (dynamique),
                       elite (mémoire des meilleurs génomes)
src/sim/               pont TypeScript : engine (chargement WASM), controller (boucle, vitesse,
                       rattrapage), worker, snapshot (sérialisation versionnée), history, intelligence
src/render/            three.js : Renderer, view (caméra), terrainColor, instances (créatures)
src/persist/           SaveStore : IndexedDB + repli mémoire
src/stores/            Pinia : world (état + worker), god (outils), ui (panneaux)
src/components/        TopBar, GodTools, Inspector, BrainView, Charts, LineChart, WorldView
e2e/                   tests Playwright (desktop, mobile, persistance, pouvoirs, courbes…)
docker/ scripts/       Dockerfiles (dev, wasm, prod), Caddyfile, scripts make
```

Flux : le **worker** fait tourner le WASM (≈ 33 ms par image, budget 22 ms) et envoie à l'UI des **images** (tampons transférés, jamais partagés) ; l'UI envoie des commandes (vitesse, outils divins, sauvegarde…). La sauvegarde est écrite par le thread principal dans IndexedDB.

## Performances (mesurées)

Natif, un tick à 10 000 créatures : ~3 ms (332 ticks/s) ; 20 000 créatures : ~6,7 ms (149 ticks/s). Coût ≈ 0,3 µs par créature et par tick. Snapshot de 10 000 créatures : ~10 Mo en ~3 ms. Le `.wasm` pèse 28 Ko.

## Suivi du projet

Le dossier **`suivi/`** garde l'historique du travail : **un fichier par conversation** (checklist, décisions, journal détaillé avec mesures et bugs trouvés, limites connues), avec un index dans `suivi/README.md`. `CLAUDE.md` fixe les règles de travail de l'agent (dont cette convention de suivi). Le plan initial a été rédigé avec Opus 5.5, le code avec Sonnet 5.5.
