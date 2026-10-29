# One-word commands. Run from the repo root.
#   make doctor  check this Mac has everything needed, with fixes
#   make setup   install Python + Node dependencies (once)
#   make db      create the database and load demo data + every pack in packs/ (re-run any time to reset)
#   make import PACK=packs/<company>.json   add or refresh one company pack
#   make run     start the app at http://localhost:8000
#   make test    run every test

PY := .venv/bin/python

setup:
	python3 -m venv .venv
	$(PY) -m pip install --upgrade pip -q
	$(PY) -m pip install -r backend/requirements.txt -q
	cd web && npm install
	cd web && npm run build
	@test -f .env || cp .env.example .env
	@echo "Setup complete. Next: put your Postgres password in .env, then run: make doctor"

doctor:
	@bash scripts/doctor.sh

db:
	cd web && node ../scripts/export-seed.mjs
	$(PY) backend/seed.py

import:
	@test -n "$(PACK)" || (echo "usage: make import PACK=packs/<company>.json" && exit 1)
	$(PY) backend/import_pack.py $(PACK)

build:
	cd web && npm run build

run: build
	$(PY) -m uvicorn app.main:app --app-dir backend --reload --port 8000

test:
	$(PY) -m pytest -q
	cd web && npm test

.PHONY: doctor setup db import build run test
