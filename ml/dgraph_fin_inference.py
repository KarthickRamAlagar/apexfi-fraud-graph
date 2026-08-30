"""Real-time inference for DGraph-Fin — "Score an Unlabeled Account".

Unlike IEEE-CIS's Score New Transaction, this scores REAL, EXISTING
background (unlabeled) nodes already sitting in the trained graph — no
feature reconstruction or synthetic neighbor-matching needed, since these
are genuine accounts with genuine features and genuine edges already
present. DGraph-Fin's edges are direct pre-existing user relationships
(not attribute-derived the way IEEE-CIS's are), so there's no honest way
to construct connections for a truly synthetic new account — this
feature instead offers real, different value: a genuine prediction on a
real account whose true outcome was never labeled in the source data
(2.47M of DGraph-Fin's 3.7M accounts are background/unlabeled by design).
"""
import pickle

import lightgbm as lgb
import numpy as np
import shap
import torch
import torch.nn.functional as F

from ml.model import FraudGraphSAGE
from ml.simple_sampler import SimpleNeighborLoader, SharedEdgeStructure

GRAPH_PATH = "dgraph_fin_graph.pt"


class DGraphFinPredictor:
    def __init__(self):
        print("Loading DGraph-Fin graph and models for real-time inference...")
        self.data = torch.load(GRAPH_PATH, weights_only=False)
        self.id_to_idx = {int(nid): i for i, nid in enumerate(self.data.node_ids.tolist())}

        self.lgbm = lgb.Booster(model_file="ml/checkpoints/dgraph_fin_lightgbm.txt")
        self.shap_explainer = shap.TreeExplainer(self.lgbm)

        checkpoint = torch.load("ml/checkpoints/dgraph_fin_model.pt", weights_only=False)
        self.gnn = FraudGraphSAGE(
            in_channels=checkpoint["in_channels"], hidden_channels=checkpoint["hidden_channels"]
        )
        self.gnn.load_state_dict(checkpoint["state_dict"])
        self.gnn.eval()

        with open("ml/checkpoints/dgraph_fin_stacking_meta.pkl", "rb") as f:
            self.stacking_meta = pickle.load(f)

        # DGraph-Fin's GNN was trained on RAW features (no normalization
        # applied) — confirmed and validated earlier, unlike IEEE-CIS
        self.shared_edges = SharedEdgeStructure(self.data.edge_index, self.data.num_nodes)

        self.feature_names = self._get_feature_names()
        print(f"  Ready. {len(self.id_to_idx):,} accounts indexed, {len(self.feature_names)} features.")

    def _get_feature_names(self):
        # queried live rather than guessed, to be certain the order
        # matches exactly what the graph builder actually used
        from sqlalchemy import text
        from etl.db.connection import get_engine

        engine = get_engine()
        with engine.connect() as conn:
            cols = conn.execute(text("SELECT * FROM gold.dgraph_fin_nodes LIMIT 0")).keys()
        x_cols = [c for c in cols if c.startswith("x")]
        return x_cols + ["total_degree", "node_timestamp"]

    def _gnn_probability(self, idx):
        seed_mask = torch.zeros(self.data.num_nodes, dtype=torch.bool)
        seed_mask[idx] = True
        loader = SimpleNeighborLoader(
            self.data, num_neighbors=[10, 5], batch_size=1,
            input_nodes=seed_mask, shuffle=False, edge_structure=self.shared_edges,
        )
        batch = next(iter(loader))
        with torch.no_grad():
            out = self.gnn(batch.x, batch.edge_index)[: batch.batch_size]
            return F.softmax(out, dim=1)[0, 1].item()

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

    def predict(self, node_id: int, threshold: float = 0.5):
        idx = self.id_to_idx.get(node_id)
        if idx is None:
            return None

        is_background = self.data.y[idx].item() == -1
        raw_features = self.data.x[idx].numpy().reshape(1, -1)

        lgbm_prob = float(self.lgbm.predict(raw_features)[0])
        gnn_prob = self._gnn_probability(idx)
        stacked_prob = float(self.stacking_meta.predict_proba([[lgbm_prob, gnn_prob]])[0, 1])

        real_degree = int(self.data.x[idx, -2].item())  # total_degree, real feature at this fixed position

        return {
            "nodeId": node_id,
            "isBackgroundAccount": is_background,
            "riskScore": round(stacked_prob, 4),
            "isFlagged": stacked_prob >= threshold,
            "threshold": threshold,
            "componentScores": {
                "lightgbm": round(lgbm_prob, 4),
                "gnn": round(gnn_prob, 4),
            },
            "topContributingFeatures": self._top_shap_features(raw_features),
            "realConnectionCount": real_degree,
            "modelInfo": {
                "type": "Stacked: LightGBM + GraphSAGE GNN (logistic combination)",
                "note": (
                    "Real inference on a real, existing account in the DGraph-Fin network — "
                    "using its actual features and actual real connections, not a reconstruction. "
                    + (
                        "This account's true fraud status was never labeled in the source data "
                        "(background/unlabeled by design) — a genuinely unknown outcome."
                        if is_background
                        else "Note: this account does have a real historical label in the source data."
                    )
                ),
            },
        }