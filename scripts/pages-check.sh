#!/bin/sh
# Teste le build « GitHub Pages » : compile le moteur, construit le site avec une base de sous-dossier
# (/<dépôt>/), le sert avec `vite preview` et lance Playwright dessus.
# Usage : ./scripts/pages-check.sh [nom-du-depot]      (défaut : life-simulator)
cd "$(dirname "$0")/.." || exit 1
REPO="${1:-life-simulator}"
./scripts/wasm.sh build || exit 1
export BASE_PATH="/$REPO/"
docker compose run --rm -e BASE_PATH app npm run build || exit 1
docker compose --profile e2e run --rm -e BASE_PATH e2e sh -c \
  "npx vite preview --host 127.0.0.1 --port 4173 --strictPort > /tmp/preview.log 2>&1 & sleep 4; BASE_URL=http://127.0.0.1:4173/$REPO/ npx playwright test e2e/pages.spec.ts; R=\$?; kill %1; exit \$R"
