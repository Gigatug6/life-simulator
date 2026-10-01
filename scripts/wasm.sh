#!/bin/sh
# Usage : scripts/wasm.sh build | test   (cargo tourne uniquement dans Docker)
cd "$(dirname "$0")/.." || exit 1
case "$1" in
  build) docker compose --profile wasm run --rm wasm sh -c "cd wasm && cargo build --release --target wasm32-unknown-unknown && mkdir -p ../src/sim/wasm && cp target/wasm32-unknown-unknown/release/life_sim.wasm ../src/sim/wasm/life.wasm" ;;
  test)  docker compose --profile wasm run --rm wasm sh -c "cd wasm && cargo test" ;;
  *) echo "usage: wasm.sh build|test" >&2; exit 2 ;;
esac
