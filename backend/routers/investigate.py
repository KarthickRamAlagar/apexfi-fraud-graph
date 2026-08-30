"""Investigate page endpoint — real transaction details, real graph
neighbors (device_shared / card_shared edges), AND real risk prediction
(stacked LightGBM + GNN model, real SHAP-based explanation).
"""
from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from backend.db import engine
from backend.services.fraud_predictor import get_predictor

router = APIRouter(prefix="/api/investigate", tags=["investigate"])

MAX_NEIGHBORS = 10


def format_transaction(row):
    return {
        "id": f"TX-{row.transactionid}",
        "amount": f"₹{row.transactionamt:,.2f}",
        "productCD": row.productcd,
        "card": f"card1: {int(row.card1)}" if row.card1 is not None else "unknown",
        "device": f"DeviceInfo: {row.deviceinfo}" if row.deviceinfo else "unknown",
        "date": row.transaction_date.isoformat() if row.transaction_date else None,
        "isFlagged": bool(row.is_fraud),
    }


@router.get("/samples")
def get_samples():
    """A handful of real transaction IDs to show as quick-pick suggestions —
    a mix of real fraud and real normal cases."""
    with engine.connect() as conn:
        fraud_rows = conn.execute(
            text(
                "SELECT transactionid, transactionamt, productcd, card1, deviceinfo, transaction_date, is_fraud "
                "FROM gold.ieee_cis_features WHERE is_fraud LIMIT 3"
            )
        ).fetchall()
        normal_rows = conn.execute(
            text(
                "SELECT transactionid, transactionamt, productcd, card1, deviceinfo, transaction_date, is_fraud "
                "FROM gold.ieee_cis_features WHERE NOT is_fraud LIMIT 3"
            )
        ).fetchall()

    return {"samples": [format_transaction(r) for r in fraud_rows + normal_rows]}


@router.get("/search")
def search_transactions(q: str, limit: int = 8):
    """Real live search across all 590,540 transactions, by ID prefix —
    used for the Investigate page's autosuggest dropdown. Must be
    registered before /{transaction_id} below, or FastAPI would try to
    match "search" itself as a transaction ID.
    """
    q = q.strip().replace("TX-", "") if q else ""
    if not q or not q.isdigit():
        return {"results": []}

    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT transactionid, transactionamt, productcd, card1, deviceinfo, transaction_date, is_fraud "
                "FROM gold.ieee_cis_features WHERE transactionid::text LIKE :pattern "
                "ORDER BY transactionid LIMIT :limit"
            ),
            {"pattern": f"{q}%", "limit": limit},
        ).fetchall()

    return {"results": [format_transaction(r) for r in rows]}


@router.get("/{transaction_id}")
def get_investigation(transaction_id: str):
    numeric_id = transaction_id.replace("TX-", "")
    if not numeric_id.isdigit():
        raise HTTPException(400, "Invalid transaction ID format — expected TX-<number>")

    with engine.connect() as conn:
        center_row = conn.execute(
            text(
                "SELECT transactionid, transactionamt, productcd, card1, deviceinfo, transaction_date, is_fraud "
                "FROM gold.ieee_cis_features WHERE transactionid = :id"
            ),
            {"id": int(numeric_id)},
        ).fetchone()

        if not center_row:
            raise HTTPException(404, f"Transaction {transaction_id} not found")

        # real neighbors — prioritize device_shared (the real, evidence-backed
        # signal) over card_shared when capping the count for display
        edge_rows = conn.execute(
            text(
                """
                SELECT
                    CASE WHEN src_transactionid = :id THEN dst_transactionid ELSE src_transactionid END AS neighbor_id,
                    edge_type
                FROM gold.ieee_cis_transaction_edges
                WHERE src_transactionid = :id OR dst_transactionid = :id
                ORDER BY (edge_type = 'device_shared') DESC
                LIMIT :limit
                """
            ),
            {"id": int(numeric_id), "limit": MAX_NEIGHBORS},
        ).fetchall()

        neighbor_ids = [r.neighbor_id for r in edge_rows]
        neighbor_details = {}
        if neighbor_ids:
            detail_rows = conn.execute(
                text(
                    "SELECT transactionid, transactionamt, productcd, card1, deviceinfo, transaction_date, is_fraud "
                    "FROM gold.ieee_cis_features WHERE transactionid = ANY(:ids)"
                ),
                {"ids": neighbor_ids},
            ).fetchall()
            neighbor_details = {r.transactionid: format_transaction(r) for r in detail_rows}

        # single grouped query for both counts, instead of two separate scans
        count_rows = conn.execute(
            text(
                """
                SELECT edge_type, COUNT(*) AS cnt
                FROM gold.ieee_cis_transaction_edges
                WHERE src_transactionid = :id OR dst_transactionid = :id
                GROUP BY edge_type
                """
            ),
            {"id": int(numeric_id)},
        ).fetchall()
        counts_by_type = {r.edge_type: r.cnt for r in count_rows}
        device_count = counts_by_type.get("device_shared", 0)
        card_count = counts_by_type.get("card_shared", 0)

    neighbors = [
        {**neighbor_details[r.neighbor_id], "edgeType": r.edge_type}
        for r in edge_rows
        if r.neighbor_id in neighbor_details
    ]

    try:
        predictor = get_predictor()
        prediction = predictor.predict(int(numeric_id))
    except Exception as e:
        # honest degradation, not a silent wrong answer — real model files
        # missing/corrupt shouldn't crash the whole page, just this part
        prediction = None
        print(f"Prediction failed for transaction {numeric_id}: {e}")

    if prediction:
        risk_assessment = {
            "status": "predicted",
            "riskScore": prediction["riskScore"],
            "isFlagged": prediction["isFlagged"],
            "threshold": prediction["threshold"],
            "componentScores": prediction["componentScores"],
            "topContributingFeatures": prediction["topContributingFeatures"],
            "modelInfo": prediction["modelInfo"],
            "note": (
                "Real prediction from the validated stacked model (LightGBM + GNN). "
                "Feature contributions via SHAP; graph context above shows real "
                "device/card-sharing connections."
            ),
        }
    else:
        risk_assessment = {
            "status": "unavailable",
            "note": (
                "This transaction is outside the trained model's dataset, or the "
                "prediction service is temporarily unavailable. The network graph "
                "above is still real structure from the database."
            ),
        }

    return {
        "center": format_transaction(center_row),
        "neighbors": neighbors,
        "connectionCounts": {"device_shared": device_count, "card_shared": card_count},
        "riskAssessment": risk_assessment,
    }