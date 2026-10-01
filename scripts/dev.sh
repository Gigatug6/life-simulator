#!/bin/sh
cd "$(dirname "$0")/.." && ./scripts/wasm.sh build && docker compose up app
