#!/bin/sh
cd "$(dirname "$0")/.." && docker compose run --rm app npm "$@"
