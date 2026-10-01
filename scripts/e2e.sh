#!/bin/sh
cd "$(dirname "$0")/.." && ./scripts/wasm.sh build && docker compose up -d --wait app && docker compose --profile e2e run --rm e2e npx playwright test "$@"
