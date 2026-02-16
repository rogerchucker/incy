.PHONY: up down migrate autogenerate seed dev-api dev-worker dev-web dev test test-e2e lint

export PYTHONPATH := $(CURDIR)/apps/api:$(CURDIR)/apps/worker
VENV_BIN := $(CURDIR)/.venv/bin

up:
	docker compose -f infra/docker-compose.yml up -d

down:
	docker compose -f infra/docker-compose.yml down

migrate:
	cd apps/api && $(VENV_BIN)/alembic upgrade head

autogenerate:
	cd apps/api && $(VENV_BIN)/alembic revision --autogenerate -m "$(msg)"

seed:
	cd apps/api && $(VENV_BIN)/python -m app.seed

dev-api:
	cd apps/api && $(VENV_BIN)/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-worker:
	cd apps/worker && $(VENV_BIN)/python -m worker.main

dev-web:
	cd apps/web && npm run dev

dev: up
	@echo "Starting all services..."
	@make dev-api &
	@make dev-worker &
	@make dev-web &

test:
	cd apps/api && $(VENV_BIN)/python -m pytest tests/ -v
	cd apps/web && npm test

test-e2e:
	cd apps/web && npx playwright test

lint:
	cd apps/api && $(VENV_BIN)/python -m ruff check .
	cd apps/web && npm run lint
