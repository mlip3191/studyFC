#!/usr/bin/env bash
# Runs the backend (uvicorn --reload on :8000) and the frontend (Vite on :5173) together.
set -euo pipefail
cd "$(dirname "$0")/.."

(cd frontend && [ -d node_modules ] || npm install)
(cd backend && uv sync)

trap 'kill 0' EXIT INT TERM
(cd backend && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000) &
(cd frontend && npm run dev) &
wait
