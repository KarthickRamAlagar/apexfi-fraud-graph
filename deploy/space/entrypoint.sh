#!/bin/sh
set -e
python -m deploy.fetch_assets
exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-7860}" --proxy-headers --forwarded-allow-ips='*'
