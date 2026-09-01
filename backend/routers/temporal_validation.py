"""Router for the temporal validation feature -- real, honest
comparison results, plus live scoring using the genuinely
chronological-split-trained model."""
import json

from fastapi import APIRouter, HTTPException

from backend.services.temporal_predictor_service import get_temporal_predictor

router = APIRouter(prefix="/api/temporal-validation", tags=["temporal-validation"])

RESULTS_PATH = "streamlit_app/data/temporal_validation_results.json"


@router.get("/results")
def get_results():
    try:
        with open(RESULTS_PATH) as f:
            return json.load(f)
    except FileNotFoundError:
        raise HTTPException(
            404,
            "No temporal validation results found -- run: "
            "uv run python -m ml.train_and_save_temporal_model",
        )


@router.post("/score")
def score_transaction(payload: dict):
    try:
        predictor = get_temporal_predictor()
        result = predictor.predict(payload)
    except Exception as e:
        print(f"Temporal prediction failed: {e}")
        raise HTTPException(503, "Unable to score this transaction. Please try again.")
    return result