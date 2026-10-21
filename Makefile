.PHONY: dev dev-backend dev-frontend test lint format check docker

dev-backend:
	cd backend && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

dev-frontend:
	cd frontend && npm run dev

# Run both (use two terminals if your make lacks -j support).
dev:
	$(MAKE) -j2 dev-backend dev-frontend

test:
	cd backend && uv run pytest -q
	cd frontend && npm test

lint:
	cd backend && uv run ruff check . && uv run ruff format --check .
	cd frontend && npm run lint && npm run format:check && npm run typecheck

format:
	cd backend && uv run ruff format . && uv run ruff check --fix .
	cd frontend && npm run format

check: lint test

docker:
	docker compose up --build
