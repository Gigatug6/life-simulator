#!/bin/sh
# e2e tests against the dev server. Two phases: the light tests run in parallel; the heavy 3D tests (tag @3d,
# software WebGL with thousands of instances) run one at a time, so that they do not starve each other of CPU.
# Extra arguments (e.g. a file or -g) are passed to both phases.
cd "$(dirname "$0")/.." && ./scripts/wasm.sh build && docker compose up -d --wait app \
 && docker compose --profile e2e run --rm e2e npx playwright test --grep-invert @3d --pass-with-no-tests "$@" \
 && docker compose --profile e2e run --rm e2e npx playwright test --grep @3d --workers=1 --pass-with-no-tests "$@"
