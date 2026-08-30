"""Real-time inference for a single transaction — used by the FastAPI
backend's Investigate endpoint. Loads the graph and all three trained
models ONCE (at backend startup, via the FraudPredictor singleton in
backend/services/fraud_predictor.py) rather than reloading them per
request, which would be slow and memory-wasteful.

Explainability: SHAP for LightGBM's real per-prediction feature
contributions (LightGBM dominates the stacking weights for most
predictions anyway, so this is genuinely the most informative part) +
real graph neighbor context (already computed separately by the existing
investigate.py endpoint) — not formal GNNExplainer, a deliberate scoping
decision given how fragile GNN-adjacent work has been on this hardware.
See chat history for the full reasoning.
"""
import pickle

import lightgbm as lgb
import numpy as np
import shap
import torch
import torch.nn.functional as F

from ml.model import FraudGraphSAGE
from ml.simple_sampler import SimpleNeighborLoader, SharedEdgeStructure
from ml.data_utils import normalize_features

GRAPH_PATH = "ieee_cis_graph.pt"
DEFAULT_THRESHOLD = 0.5


class FraudPredictor:
    def __init__(self):
        print("Loading IEEE-CIS graph and models for real-time inference...")
        self.data = torch.load(GRAPH_PATH, weights_only=False)
        self.feature_names = getattr(
            self.data, "feature_names", [f"feature_{i}" for i in range(self.data.num_node_features)]
        )
        self.id_to_idx = {int(tid): i for i, tid in enumerate(self.data.transaction_ids.tolist())}

        self.lgbm = lgb.Booster(model_file="ml/checkpoints/ieee_cis_lightgbm.txt")
        self.shap_explainer = shap.TreeExplainer(self.lgbm)

        checkpoint = torch.load("ml/checkpoints/ieee_cis_model.pt", weights_only=False)
        self.gnn = FraudGraphSAGE(
            in_channels=checkpoint["in_channels"], hidden_channels=checkpoint["hidden_channels"]
        )
        self.gnn.load_state_dict(checkpoint["state_dict"])
        self.gnn.eval()

        with open("ml/checkpoints/ieee_cis_stacking_meta.pkl", "rb") as f:
            self.stacking_meta = pickle.load(f)

        # normalized clone for GNN use only — LightGBM/SHAP use self.data.x
        # (raw) directly, same split established in stack_ieee_cis.py
        self.data_for_gnn = normalize_features(self.data.clone())
        self.shared_edges = SharedEdgeStructure(self.data_for_gnn.edge_index, self.data_for_gnn.num_nodes)

        print(f"  Ready. {len(self.id_to_idx):,} transactions indexed, {len(self.feature_names)} features.")

    def _gnn_probability(self, idx):
        seed_mask = torch.zeros(self.data_for_gnn.num_nodes, dtype=torch.bool)
        seed_mask[idx] = True
        loader = SimpleNeighborLoader(
            self.data_for_gnn, num_neighbors=[10, 5], batch_size=1,
            input_nodes=seed_mask, shuffle=False, edge_structure=self.shared_edges,
        )
        batch = next(iter(loader))
        with torch.no_grad():
            out = self.gnn(batch.x, batch.edge_index)[: batch.batch_size]
            return F.softmax(out, dim=1)[0, 1].item()

    def _top_shap_features(self, raw_features, top_n=5):
        shap_values = self.shap_explainer.shap_values(raw_features)
        # different shap/LightGBM version combos return slightly different
        # shapes — handle the common ones defensively rather than assume one
        if isinstance(shap_values, list):
            shap_values = shap_values[-1]  # positive (fraud) class
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

    def predict(self, transaction_id: int, threshold: float = DEFAULT_THRESHOLD):
        idx = self.id_to_idx.get(transaction_id)
        if idx is None:
            return None  # caller (FastAPI route) turns this into a 404

        raw_features = self.data.x[idx].numpy().reshape(1, -1)

        lgbm_prob = float(self.lgbm.predict(raw_features)[0])
        gnn_prob = self._gnn_probability(idx)

        stacked_prob = float(
            self.stacking_meta.predict_proba([[lgbm_prob, gnn_prob]])[0, 1]
        )

        return {
            "transactionId": transaction_id,
            "riskScore": round(stacked_prob, 4),
            "isFlagged": stacked_prob >= threshold,
            "threshold": threshold,
            "componentScores": {
                "lightgbm": round(lgbm_prob, 4),
                "gnn": round(gnn_prob, 4),
            },
            "topContributingFeatures": self._top_shap_features(raw_features),
            "modelInfo": {
                "type": "Stacked: LightGBM + GraphSAGE GNN (logistic combination)",
                "validated": "3-seed cross-validation — see model governance page for real metrics",
            },
        }