"""Dashboard page endpoint. The main summary is precomputed (see
backend/services/precompute_summaries.py) — running COUNT(*) live on the
17.3M-row edges table and 3.7M-row nodes table on every single page visit
was the real cause of slow loading, not a React hook choice. Only
recent-transactions stays a live query (small, fast, LIMIT 8).
"""
from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from backend.db import engine

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
def get_summary():
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT payload FROM gold.precomputed_summary WHERE dataset_key = 'dashboard'")
        ).fetchone()

    if not row:
        raise HTTPException(
            404,
            "No precomputed summary found — run: uv run python -m backend.services.precompute_summaries",
        )
    return row.payload


@router.get("/recent-transactions")
def get_recent_transactions():
    """A real mix of transactions with their real historical fraud LABEL —
    not a live risk prediction (the model isn't trained yet). Labeled
    honestly on the frontend as historical ground truth, not a score.
    """
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT transactionid, transactionamt, deviceinfo, card1, is_fraud
                FROM gold.ieee_cis_features
                ORDER BY transaction_date DESC
                LIMIT 8
                """
            )
        ).fetchall()

    return {
        "transactions": [
            {
                "id": f"TX-{r.transactionid}",
                "amount": f"₹{r.transactionamt:,.2f}",
                "device": f"DeviceInfo: {r.deviceinfo}" if r.deviceinfo else "unknown",
                "card": f"card1: {int(r.card1)}" if r.card1 is not None else "unknown",
                "historicalLabel": "Fraud" if r.is_fraud else "Normal",
            }
            for r in rows
        ]
    }
