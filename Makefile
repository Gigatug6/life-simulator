prod:       ## build de production (Caddy) sur http://localhost:8080
	docker compose --profile prod up -d --build web

e2e-prod:   ## tests e2e sur le build de production
	./scripts/e2e-prod.sh

.PHONY: prod e2e-prod init build install dev up down logs check typecheck test wasm wasm-test e2e sh npm clean

init:       ## génère .env (UID/GID) et build les images
	./scripts/init-env.sh
	docker compose build
	docker compose --profile wasm build

build: init

install:    ## npm install dans Docker
	./scripts/npm.sh install

wasm:       ## compile le moteur Rust -> src/sim/wasm/life.wasm
	./scripts/wasm.sh build

wasm-test:  ## cargo test dans Docker
	./scripts/wasm.sh test

dev:        ## serveur de dev (http://localhost:5173)
	./scripts/dev.sh

up:
	docker compose up -d --wait app

down:
	docker compose down

logs:
	docker compose logs -f app

check:      ## cargo test + typecheck + vitest + build
	./scripts/check.sh

typecheck:
	./scripts/npm.sh run typecheck

test:
	./scripts/npm.sh test

e2e:
	./scripts/e2e.sh

sh:
	docker compose run --rm app bash

npm:        ## make npm ARGS="install foo"
	./scripts/npm.sh $(ARGS)

clean:
	docker compose --profile e2e --profile wasm down -v
