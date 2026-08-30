"""Score an Unlabeled Account — real inference on a real, existing
DGraph-Fin account whose true fraud status was never labeled in the
source data. See ml/dgraph_fin_inference.py for the real reasoning
behind why this is a genuinely different design from IEEE-CIS's Score
New Transaction (DGraph-Fin's edges are direct pre-existing user
relationships, not attribute-derived, so there's no honest way to build
connections for a truly synthetic new account).
"""
from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from backend.db import engine
from backend.services.dgraph_fin_predictor_service import get_dgraph_fin_predictor

router = APIRouter(prefix="/api/dgraph-fin", tags=["dgraph-fin"])


@router.get("/search")
def search_accounts(q: str, limit: int = 8):
    """Real search across all 3.7M DGraph-Fin accounts, by ID prefix —
    not limited to the 8 sample chips shown on the page.
    """
    q = q.strip() if q else ""
    if not q or not q.isdigit():
        return {"results": []}

    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """SELECT node_id, total_degree, label FROM gold.dgraph_fin_nodes
                   WHERE node_id::text LIKE :pattern
                   ORDER BY node_id LIMIT :limit"""
            ),
            {"pattern": f"{q}%", "limit": limit},
        ).fetchall()

    return {
        "results": [
            {
                "nodeId": int(r.node_id),
                "connections": int(r.total_degree or 0),
                "isBackgroundAccount": r.label not in ("fraud", "normal"),
            }
            for r in rows
        ]
    }


@router.get("/samples")
def get_background_samples():
    """A real mix of background (unlabeled) account IDs to get started
    with — genuinely unknown outcomes, not hand-picked for effect.
    """
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """SELECT node_id, total_degree FROM gold.dgraph_fin_nodes
                   TABLESAMPLE SYSTEM (1)
                   WHERE label NOT IN ('fraud', 'normal')
                   LIMIT 8"""
            )
        ).fetchall()
    return {"samples": [{"nodeId": int(r.node_id), "connections": int(r.total_degree or 0)} for r in rows]}


@router.get("/score/{node_id}")
def score_account(node_id: int):
    try:
        predictor = get_dgraph_fin_predictor()
        result = predictor.predict(node_id)
    except Exception as e:
        print(f"DGraph-Fin prediction failed for account {node_id}: {e}")
        raise HTTPException(503, "Unable to score this account. Please try again.")

    if result is None:
        raise HTTPException(404, f"Account {node_id} not found in the DGraph-Fin dataset.")

    return result