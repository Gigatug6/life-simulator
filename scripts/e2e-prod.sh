#!/bin/sh
# Tests e2e contre le build de production servi par Caddy (http://web). Les tests qui importent /src/*
# (serveur de dev) sont exclus.
cd "$(dirname "$0")/.." && docker compose --profile prod up -d --build --wait web 2>&1 | tail -2 \
 && docker compose --profile e2e run --rm -e BASE_URL=http://web e2e npx playwright test \
    e2e/smoke.spec.ts e2e/world.spec.ts e2e/god.spec.ts e2e/inspect.spec.ts e2e/charts.spec.ts e2e/mobile.spec.ts "$@"
