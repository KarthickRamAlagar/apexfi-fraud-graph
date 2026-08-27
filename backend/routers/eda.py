"""EDA page endpoint — reads precomputed summaries (see
backend/services/precompute_summaries.py), not computed live. Correlation
matrices and histograms over 590K-3.7M row tables are too slow for a
per-request API call.
"""
from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from backend.db import engine

router = APIRouter(prefix="/api/eda", tags=["eda"])

DATASET_KEYS = {"ieee_cis": "eda_ieee_cis", "dgraph_fin": "eda_dgraph_fin"}


@router.get("/{dataset}")
def get_eda(dataset: str):
    if dataset not in DATASET_KEYS:
        raise HTTPException(404, f"Unknown dataset '{dataset}'. Use one of: {list(DATASET_KEYS)}")

    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT payload, computed_at FROM gold.precomputed_summary WHERE dataset_key = :k"),
            {"k": DATASET_KEYS[dataset]},
        ).fetchone()

    if not row:
        raise HTTPException(
            404,
            "No precomputed summary found — run: uv run python -m backend.services.precompute_summaries",
        )

    payload = row.payload
    payload["computedAt"] = row.computed_at.isoformat()
    return payload
