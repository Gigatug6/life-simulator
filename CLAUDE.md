# Règles pour l'agent (Simulateur de vie « Dieu »)

Plan : planifié avec **Opus 5.5**, codé avec **Sonnet 5.5**. Plan complet : `/home/giga/.claude/plans/unified-finding-cerf.md`.

1. **Ne jamais exécuter `node`, `npm`, `npx`, `vite`, `cargo` ou `rustc` sur l'hôte.** Tout passe par `./scripts/npm.sh`, `./scripts/wasm.sh`, `./scripts/check.sh`, `./scripts/e2e.sh` ou `docker compose run --rm …`.
2. Boucle : lire `PROGRESS.md` → faire UNIQUEMENT la « Prochaine étape » → lancer sa validation → mettre à jour PROGRESS (case, journal, prochaine étape) → `git commit` (`feat(x.y): …`).
3. Ne pas avancer si la validation est rouge. Après 3 échecs sur un même point : plan B, noter dans « Blocages », continuer.
4. Ne pas affaiblir un test pour qu'il passe, sauf s'il est prouvé faux (justifier dans le journal).
5. `src/sim/**` et `wasm/**` n'importent jamais Vue/Pinia. Aucun objet three dans un état réactif. Toujours `dispose()`.
6. **Aucune API / aucun serveur** : la persistance est uniquement dans le navigateur (IndexedDB / localStorage).
7. WASM : Rust `no_std`, zéro crate externe, sans wasm-bindgen. Le `.wasm` est généré (`make wasm`), jamais commité.
8. Étapes visuelles : relire les captures `artifacts/screens/*.png` et décrire ce qui est visible.
9. Pas de `docker compose down -v` sans raison. Après modif de `package.json` : `./scripts/npm.sh install`.
10. UI en français. Pas de vue-router. Toute nouvelle dépendance est notée dans « Décisions ». TypeScript reste en 5.9.
