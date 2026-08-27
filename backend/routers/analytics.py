"""Analytics page endpoint — reads the precomputed summary (see
backend/services/precompute_summaries.py). The heatmap, edge-lift, and
fiscal-year overlay queries all involve full-table aggregation over
590K+ rows — precomputed once rather than on every page load.
"""
from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from backend.db import engine

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/")
def get_analytics():
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT payload, computed_at FROM gold.precomputed_summary WHERE dataset_key = 'analytics'")
        ).fetchone()

    if not row:
        raise HTTPException(
            404,
            "No precomputed summary found — run: uv run python -m backend.services.precompute_summaries",
        )

    payload = row.payload
    payload["computedAt"] = row.computed_at.isoformat()
    return payload
