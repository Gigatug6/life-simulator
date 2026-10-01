#!/bin/sh
cd "$(dirname "$0")/.." && ./scripts/wasm.sh test && ./scripts/wasm.sh build \
 && docker compose run --rm app sh -c "npm run typecheck && npm test && npm run build"
