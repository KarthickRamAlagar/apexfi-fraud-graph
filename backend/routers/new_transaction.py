"""Score New Transaction — real, forward-looking inference on a
transaction that does NOT already exist in the training/test dataset.
Different from Investigate (retrospective lookup of an existing
transaction ID) — see ml/new_transaction_predictor.py for the full
pipeline this calls into.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.services.new_transaction_predictor_service import get_new_transaction_predictor

router = APIRouter(prefix="/api/predict", tags=["new-transaction"])


class NewTransactionRequest(BaseModel):
    # Required — a transaction needs at least an amount and product type
    transactionamt: float = Field(..., gt=0, le=10_000_000, description="Transaction amount")
    productcd: str

    # Optional — card details
    card1: Optional[int] = None
    card2: Optional[int] = None
    card3: Optional[int] = None
    card4: Optional[str] = None
    card5: Optional[int] = None
    card6: Optional[str] = None

    # Optional — address
    addr1: Optional[int] = None
    addr2: Optional[int] = None

    # Optional — email
    p_emaildomain: Optional[str] = None
    r_emaildomain: Optional[str] = None

    # Optional — device
    devicetype: Optional[str] = None
    deviceinfo: Optional[str] = None

    # Optional — counting features (real behavioral signal from the
    # source dataset — e.g. number of addresses/emails associated with
    # this card; exact per-column definitions aren't publicly documented
    # by the original dataset, but these are genuine, obtainable counts
    # a real production system would have, unlike the anonymized V columns)
    c1: Optional[float] = None
    c2: Optional[float] = None
    c3: Optional[float] = None
    c4: Optional[float] = None
    c5: Optional[float] = None
    c6: Optional[float] = None
    c7: Optional[float] = None
    c8: Optional[float] = None
    c9: Optional[float] = None
    c10: Optional[float] = None
    c11: Optional[float] = None
    c12: Optional[float] = None
    c13: Optional[float] = None
    c14: Optional[float] = None

    # Optional — numeric device/session telemetry (timing, counts) —
    # genuinely capturable in a real system, not anonymized
    id_02: Optional[float] = None
    id_11: Optional[float] = None
    id_14: Optional[float] = None
    id_17: Optional[float] = None
    id_19: Optional[float] = None
    id_20: Optional[float] = None


@router.post("/new-transaction")
def score_new_transaction(req: NewTransactionRequest):
    try:
        predictor = get_new_transaction_predictor()
        result = predictor.predict(req.model_dump())
    except Exception as e:
        print(f"New-transaction prediction failed: {e}")
        raise HTTPException(
            503,
            "Unable to score this transaction. The submitted data could not be "
            "processed by the trained model pipeline. Please check your inputs "
            "and try again.",
        )

    return result