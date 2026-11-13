#!/usr/bin/env bash
# One command to run ApexFi: backend (port 8000) and frontend (port 5173) together.
# Usage, from the repo folder:   bash run_all.sh
# Stop both with Ctrl+C.
cd "$(dirname "$0")" || exit 1

uv run uvicorn backend.main:app --port 8000 &
BACK=$!

( cd frontend && npm run dev ) &
FRONT=$!

cleanup() { echo; echo "Stopping ApexFi..."; kill $BACK $FRONT 2>/dev/null; exit 0; }
trap cleanup INT TERM

echo "Backend : http://localhost:8000   (API docs: http://localhost:8000/docs)"
echo "Frontend: http://localhost:5173"
echo "Ops page (response times, service health): http://localhost:5173/ops"
wait
