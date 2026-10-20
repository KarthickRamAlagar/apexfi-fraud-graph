"""Router for the temporal validation feature -- real, honest
comparison results, plus live scoring using the genuinely
chronological-split-trained model, plus a full consolidated report
covering all of the baseline evaluation checklist's real results."""
import json
import os

from fastapi import APIRouter, HTTPException

from backend.services.temporal_predictor_service import get_temporal_predictor

router = APIRouter(prefix="/api/temporal-validation", tags=["temporal-validation"])

DATA_DIR = "streamlit_app/data"
RESULTS_PATH = f"{DATA_DIR}/temporal_validation_results.json"

# All real result files generated across tonight's baseline evaluation
# checklist -- consolidated into one endpoint so the frontend can build
# a complete report from a single call.
REPORT_FILES = {
    "extraMetrics": "extra_metrics.json",
    "randomSplitFullMetrics": "random_split_full_metrics.json",
    "thresholdOptimization": "threshold_optimization.json",
    "quickWins": "quick_wins.json",
    "shapGlobalImportance": "shap_global_importance.json",
    "hybridStacking": "temporal_hybrid_stacking.json",
    "hybridThresholdCheck": "hybrid_threshold_check.json",
    "featureGroupAblation": "feature_group_ablation.json",
    "databaseOptimization": "database_optimization.json",
}


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


@router.get("/full-report")
def get_full_report():
    """Real, consolidated results from every item in the baseline
    evaluation checklist -- reads each already-saved JSON file rather
    than recomputing anything live."""
    report = {}
    missing = []
    for key, filename in REPORT_FILES.items():
        path = os.path.join(DATA_DIR, filename)
        if os.path.exists(path):
            with open(path) as f:
                report[key] = json.load(f)
        else:
            report[key] = None
            missing.append(filename)

    if missing:
        # honest -- surfaces exactly what's not ready yet, rather than
        # silently omitting it or crashing
        report["_missingFiles"] = missing

    return report


@router.post("/score")
def score_transaction(payload: dict):
    try:
        predictor = get_temporal_predictor()
        result = predictor.predict(payload)
    except Exception as e:
        print(f"Temporal prediction failed: {e}")
        raise HTTPException(503, "Unable to score this transaction. Please try again.")
    return result