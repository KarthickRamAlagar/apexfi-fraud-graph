"""Probability-level stacking: combine LightGBM's and the GNN's final
probability outputs directly, rather than feeding raw GNN embeddings into
LightGBM (which may be too high-dimensional/noisy for trees to use well).

Two approaches tried:
  1. Weighted average of the two probabilities (simple, no extra training)
  2. A small logistic regression meta-model trained on [lgbm_prob, gnn_prob]
     as its only two inputs — lets the data decide the best blend weight
     rather than guessing one.

Uses lightgbm's OWN validation-set predictions (not the hybrid model) as
the baseline probability, plus a GNN inference pass, for a genuinely
different combination strategy from the embedding-concatenation approach.
"""
import lightgbm as lgb
import numpy as np
import torch
import torch.nn.functional as F
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    precision_score, recall_score, f1_score, roc_auc_score, average_precision_score, confusion_matrix,
)

from ml.model import FraudGraphSAGE
from ml.simple_sampler import SimpleNeighborLoader, SharedEdgeStructure
from ml.data_utils import normalize_features

GRAPH_PATH = "ieee_cis_graph.pt"


@torch.no_grad()
def get_gnn_probs(model, data, mask, num_neighbors=(10, 5), batch_size=512, edge_structure=None):
    model.eval()
    loader = SimpleNeighborLoader(data, num_neighbors=list(num_neighbors), batch_size=batch_size, input_nodes=mask, shuffle=False, edge_structure=edge_structure)
    all_probs = []
    for batch in loader:
        out = model(batch.x, batch.edge_index)[: batch.batch_size]
        all_probs.append(F.softmax(out, dim=1)[:, 1])
    return torch.cat(all_probs).numpy()


def report(name, labels, probs, threshold=0.5):
    preds = (probs >= threshold).astype(int)
    print(f"\n{name}:")
    print(f"  precision: {precision_score(labels, preds, zero_division=0):.4f}")
    print(f"  recall: {recall_score(labels, preds, zero_division=0):.4f}")
    print(f"  f1: {f1_score(labels, preds, zero_division=0):.4f}")
    print(f"  roc_auc: {roc_auc_score(labels, probs):.4f}")
    print(f"  pr_auc: {average_precision_score(labels, probs):.4f}")


def main():
    print("Loading graph and models...")
    data = torch.load(GRAPH_PATH, weights_only=False)
    lgbm = lgb.Booster(model_file="ml/checkpoints/ieee_cis_lightgbm.txt")

    checkpoint = torch.load("ml/checkpoints/ieee_cis_model.pt", weights_only=False)
    gnn = FraudGraphSAGE(in_channels=checkpoint["in_channels"], hidden_channels=checkpoint["hidden_channels"])
    gnn.load_state_dict(checkpoint["state_dict"])

    X = data.x.numpy()  # RAW features — LightGBM needs these unnormalized, it's scale-invariant
    y = data.y.numpy()
    val_mask, test_mask = data.val_mask, data.test_mask
    val_idx, test_idx = val_mask.numpy(), test_mask.numpy()

    # separate NORMALIZED copy for the GNN only — neural networks are
    # sensitive to feature scale (unlike LightGBM), see data_utils.py
    data_for_gnn = normalize_features(data.clone())

    print("Getting LightGBM probabilities...")
    lgbm_val_probs = lgbm.predict(X[val_idx])
    lgbm_test_probs = lgbm.predict(X[test_idx])

    print("Getting GNN probabilities (runs inference over the graph)...")
    shared_edges = SharedEdgeStructure(data_for_gnn.edge_index, data_for_gnn.num_nodes)
    gnn_val_probs = get_gnn_probs(gnn, data_for_gnn, val_mask, edge_structure=shared_edges)
    gnn_test_probs = get_gnn_probs(gnn, data_for_gnn, test_mask, edge_structure=shared_edges)

    y_val, y_test = y[val_idx], y[test_idx]

    report("LightGBM alone (reference)", y_test, lgbm_test_probs)
    report("GNN alone (reference)", y_test, gnn_test_probs)

    print("\n--- Weighted average blend ---")
    best_f1, best_w = -1, 0.5
    for w in np.arange(0, 1.05, 0.1):
        blend_val = w * lgbm_val_probs + (1 - w) * gnn_val_probs
        preds = (blend_val >= 0.5).astype(int)
        f1 = f1_score(y_val, preds, zero_division=0)
        if f1 > best_f1:
            best_f1, best_w = f1, w
    print(f"Best LightGBM weight on validation: {best_w:.2f} (val F1 {best_f1:.4f})")
    blend_test = best_w * lgbm_test_probs + (1 - best_w) * gnn_test_probs
    report(f"Weighted blend (w={best_w:.2f})", y_test, blend_test)

    print("\n--- Logistic regression meta-model ---")
    meta_X_val = np.stack([lgbm_val_probs, gnn_val_probs], axis=1)
    meta_X_test = np.stack([lgbm_test_probs, gnn_test_probs], axis=1)
    meta = LogisticRegression()
    meta.fit(meta_X_val, y_val)
    meta_test_probs = meta.predict_proba(meta_X_test)[:, 1]
    report("Logistic stacking", y_test, meta_test_probs)
    print(f"\nLearned weights: LightGBM={meta.coef_[0][0]:.3f}, GNN={meta.coef_[0][1]:.3f}")

    # persist — this is currently the best F1/precision result, worth
    # being able to reload rather than re-deriving from scratch
    import json
    import pickle

    meta_preds = (meta_test_probs >= 0.5).astype(int)
    metrics = {
        "precision": round(precision_score(y_test, meta_preds, zero_division=0), 4),
        "recall": round(recall_score(y_test, meta_preds, zero_division=0), 4),
        "f1": round(f1_score(y_test, meta_preds, zero_division=0), 4),
        "roc_auc": round(roc_auc_score(y_test, meta_test_probs), 4),
        "pr_auc": round(average_precision_score(y_test, meta_test_probs), 4),
        "confusion_matrix": confusion_matrix(y_test, meta_preds).tolist(),
        "model": "Logistic stacking: LightGBM + GNN probabilities",
        "learned_weight_lightgbm": round(float(meta.coef_[0][0]), 3),
        "learned_weight_gnn": round(float(meta.coef_[0][1]), 3),
        "note": (
            "F1/precision genuinely improved over LightGBM alone, but ROC-AUC/"
            "PR-AUC (ranking-quality metrics) stayed essentially flat — the "
            "gain reflects a better operating point from combining models, "
            "not fundamentally new discriminative signal from the graph. "
            "The learned weight ratio (~19:1 favoring LightGBM) reflects this."
        ),
    }

    with open("ml/checkpoints/ieee_cis_stacking_meta.pkl", "wb") as f:
        pickle.dump(meta, f)
    print("\nSaved stacking meta-model to ml/checkpoints/ieee_cis_stacking_meta.pkl")

    with open("streamlit_app/data/model_metrics_ieee_cis_stacked.json", "w") as f:
        json.dump(metrics, f, indent=2)
    print("Saved metrics to streamlit_app/data/model_metrics_ieee_cis_stacked.json")


if __name__ == "__main__":
    main()
