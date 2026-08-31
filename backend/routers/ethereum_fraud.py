"""Router for the Ethereum blockchain fraud experiment -- a real, third,
independent proof point for ApexFi's explainable fraud-detection
methodology, kept deliberately separate from the UPI/IMPS pipeline."""
from fastapi import APIRouter, HTTPException

from backend.services.ethereum_fraud_predictor_service import get_ethereum_fraud_predictor

router = APIRouter(prefix="/api/ethereum-fraud", tags=["ethereum-fraud"])


@router.get("/samples")
def get_samples():
    predictor = get_ethereum_fraud_predictor()
    return {"samples": predictor.sample_addresses()}


@router.get("/search")
def search(q: str):
    if not q or len(q) < 3:
        return {"results": []}
    predictor = get_ethereum_fraud_predictor()
    return {"results": predictor.search(q)}


@router.get("/score/{address}")
def score(address: str):
    try:
        predictor = get_ethereum_fraud_predictor()
        result = predictor.predict(address)
    except Exception as e:
        print(f"Ethereum fraud prediction failed for {address}: {e}")
        raise HTTPException(503, "Unable to score this account. Please try again.")

    if result is None:
        raise HTTPException(404, f"Address {address} not found in the dataset.")
    return result