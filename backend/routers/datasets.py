"""Datasets page endpoint — reads the precomputed list (see
backend/services/precompute_summaries.py) instead of running COUNT(*) live
on all 7 Gold tables (including two multi-million-row ones) every request.
"""
from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from backend.db import engine

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


@router.get("/")
def list_datasets():
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT payload FROM gold.precomputed_summary WHERE dataset_key = 'datasets'")
        ).fetchone()

    if not row:
        raise HTTPException(
            404,
            "No precomputed summary found — run: uv run python -m backend.services.precompute_summaries",
        )
    return row.payload
