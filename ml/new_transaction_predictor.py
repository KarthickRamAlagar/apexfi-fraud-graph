"""The complete "Score New Transaction" pipeline — combines Stage 1
(LightGBM) + Stage 2 (real GNN graph scoring) through the ACTUAL saved
stacking model, with real SHAP explanations. This is what powers the
live "Score New Transaction" feature — every number here comes from
real, already-validated inference, nothing hardcoded.
"""
import pickle

import lightgbm as lgb
import numpy as np
import shap

from ml.new_transaction_graph_scorer import NewTransactionGraphScorer

ARTIFACTS_PATH = "ml/checkpoints/ieee_cis_preprocessing_artifacts.pkl"
LIGHTGBM_PATH = "ml/checkpoints/ieee_cis_lightgbm.txt"
STACKING_PATH = "ml/checkpoints/ieee_cis_stacking_meta.pkl"

DEFAULT_THRESHOLD = 0.5


class NewTransactionPredictor:
    def __init__(self):
        print("Loading full new-transaction prediction pipeline (LightGBM + GNN + stacking + SHAP)...")
        with open(ARTIFACTS_PATH, "rb") as f:
            self.artifacts = pickle.load(f)

        self.lgbm = lgb.Booster(model_file=LIGHTGBM_PATH)
        self.shap_explainer = shap.TreeExplainer(self.lgbm)

        self.graph_scorer = NewTransactionGraphScorer()  # Stage 2, real GNN scoring

        with open(STACKING_PATH, "rb") as f:
            self.stacking_meta = pickle.load(f)

        self.feature_names = self.artifacts["full_feature_order"]
        print("  Full new-transaction pipeline ready.")

    def _top_shap_features(self, raw_features, top_n=5):
        shap_values = self.shap_explainer.shap_values(raw_features)
        if isinstance(shap_values, list):
            shap_values = shap_values[-1]
        values = np.array(shap_values).reshape(-1)
        order = np.argsort(-np.abs(values))[:top_n]
        return [
            {
                "feature": self.feature_names[i],
                "value": round(float(raw_features[0, i]), 4),
                "contribution": round(float(values[i]), 4),
            }
            for i in order
        ]

    def predict(self, raw_input: dict, threshold: float = DEFAULT_THRESHOLD) -> dict:
        # Stage 2 runs FIRST now — it finds real neighbors AND builds the
        # correct feature vector (with real degree counts baked in) that
        # Stage 1 (LightGBM) then reuses, fixing a real bug where
        # LightGBM was previously always given 0 real connections
        # regardless of what the graph lookup actually found.
        graph_result = self.graph_scorer.score(raw_input)
        gnn_prob = graph_result["gnn_probability"]
        raw_vec = graph_result["lightgbm_feature_vector"]

        lgbm_prob = float(self.lgbm.predict(raw_vec)[0])

        # Stage 3: the SAME saved stacking model used for real predictions elsewhere
        stacked_prob = float(self.stacking_meta.predict_proba([[lgbm_prob, gnn_prob]])[0, 1])

        return {
            "riskScore": round(stacked_prob, 4),
            "isFlagged": stacked_prob >= threshold,
            "threshold": threshold,
            "componentScores": {
                "lightgbm": round(lgbm_prob, 4),
                "gnn": round(gnn_prob, 4),
            },
            "topContributingFeatures": self._top_shap_features(raw_vec),
            "graphContext": {
                "hop1Neighbors": graph_result["num_hop1_neighbors"],
                "hop2Neighbors": graph_result["num_hop2_neighbors"],
                "matchedTransactionIds": [f"TX-{tid}" for tid in graph_result["matched_transaction_ids"]],
                "matchedNeighbors": graph_result["matched_neighbors"],
            },
            "inferenceType": "new_transaction",
            "modelInfo": {
                "type": "Stacked: LightGBM + GraphSAGE GNN (logistic combination)",
                "note": (
                    "Real inference on a previously-unseen transaction, using the same "
                    "trained models and preprocessing artifacts as the rest of this system. "
                    "Not added to the training dataset."
                ),
            },
        }