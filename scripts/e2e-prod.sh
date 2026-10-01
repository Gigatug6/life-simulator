#!/bin/sh
# e2e tests against the production build served by Caddy (http://web). Tests that import /src/*
# (dev server) are excluded.
cd "$(dirname "$0")/.." && docker compose --profile prod up -d --build --wait web 2>&1 | tail -2 \
 && docker compose --profile e2e run --rm -e BASE_URL=http://web e2e npx playwright test \
    e2e/smoke.spec.ts e2e/world.spec.ts e2e/god.spec.ts e2e/inspect.spec.ts e2e/charts.spec.ts e2e/mobile.spec.ts "$@"
