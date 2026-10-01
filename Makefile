prod:       ## production build (Caddy) on http://localhost:8080
	docker compose --profile prod up -d --build web

pages-check: ## tests the GitHub Pages build (sub-folder /life-simulator/)
	./scripts/pages-check.sh

e2e-prod:   ## e2e tests on the production build
	./scripts/e2e-prod.sh

.PHONY: prod pages-check e2e-prod init build install dev up down logs check typecheck test wasm wasm-test e2e sh npm clean

init:       ## generates .env (UID/GID) and builds the images
	./scripts/init-env.sh
	docker compose build
	docker compose --profile wasm build

build: init

install:    ## npm install inside Docker
	./scripts/npm.sh install

wasm:       ## compiles the Rust engine -> src/sim/wasm/life.wasm
	./scripts/wasm.sh build

wasm-test:  ## cargo test inside Docker
	./scripts/wasm.sh test

dev:        ## dev server (http://localhost:5173)
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
