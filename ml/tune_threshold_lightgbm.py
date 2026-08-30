"""Threshold tuning for the LightGBM models (baseline or hybrid) — same
idea as tune_threshold.py for the GNN, but LightGBM doesn't need the
graph sampler, just a direct predict() call.

Picks the threshold that maximizes F1 on VALIDATION, then reports real
metrics at that threshold on the held-out TEST set (never touched until
the final step).
"""
import sys

import lightgbm as lgb
import numpy as np
import torch
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, average_precision_score, confusion_matrix,
)

GRAPH_PATH = "ieee_cis_graph.pt"


def metrics_at_threshold(labels, probs, threshold):
    preds = (probs >= threshold).astype(int)
    return {
        "threshold": round(float(threshold), 3),
        "precision": round(precision_score(labels, preds, zero_division=0), 4),
        "recall": round(recall_score(labels, preds, zero_division=0), 4),
        "f1": round(f1_score(labels, preds, zero_division=0), 4),
    }


def main(model_path, use_embeddings=False):
    print(f"Loading model from {model_path}...")
    model = lgb.Booster(model_file=model_path)

    print(f"Loading graph data from {GRAPH_PATH}...")
    data = torch.load(GRAPH_PATH, weights_only=False)
    X = data.x.numpy()
    y = data.y.numpy()

    if use_embeddings:
        emb_data = torch.load("ml/checkpoints/ieee_cis_embeddings.pt", weights_only=False)
        assert torch.equal(data.transaction_ids, emb_data["transaction_ids"]), "ID mismatch"
        X = np.concatenate([X, emb_data["embeddings"].numpy()], axis=1)

    val_idx = data.val_mask.numpy()
    test_idx = data.test_mask.numpy()

    val_probs = model.predict(X[val_idx])
    val_labels = y[val_idx]

    print("\nThreshold sweep (validation set):")
    print(f"{'Threshold':>10} {'Precision':>10} {'Recall':>10} {'F1':>10}")
    best_f1, best_threshold = -1, 0.5
    for t in np.arange(0.1, 0.95, 0.05):
        m = metrics_at_threshold(val_labels, val_probs, t)
        print(f"{m['threshold']:>10} {m['precision']:>10} {m['recall']:>10} {m['f1']:>10}")
        if m["f1"] > best_f1:
            best_f1 = m["f1"]
            best_threshold = t

    print(f"\nBest threshold on validation: {best_threshold:.3f} (val F1 {best_f1:.4f})")

    test_probs = model.predict(X[test_idx])
    test_labels = y[test_idx]

    tuned = metrics_at_threshold(test_labels, test_probs, best_threshold)
    tuned["accuracy"] = round(accuracy_score(test_labels, (test_probs >= best_threshold).astype(int)), 4)
    tuned["roc_auc"] = round(roc_auc_score(test_labels, test_probs), 4)
    tuned["pr_auc"] = round(average_precision_score(test_labels, test_probs), 4)
    tuned["confusion_matrix"] = confusion_matrix(test_labels, (test_probs >= best_threshold).astype(int)).tolist()

    print(f"\nFinal TEST metrics at tuned threshold {best_threshold:.3f}:")
    for k, v in tuned.items():
        print(f"  {k}: {v}")

    default = metrics_at_threshold(test_labels, test_probs, 0.5)
    print(f"\nFor comparison, default threshold 0.5:")
    for k, v in default.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    model_path = sys.argv[1] if len(sys.argv) > 1 else "ml/checkpoints/ieee_cis_lightgbm.txt"
    use_embeddings = "hybrid" in model_path
    main(model_path, use_embeddings=use_embeddings)
