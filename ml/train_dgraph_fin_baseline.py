"""LightGBM baseline for DGraph-Fin — tabular features only, NO graph
structure. Same purpose as train_ieee_cis_baseline.py: a fair non-graph
comparison point, using the exact same train/val/test split already saved
in dgraph_fin_graph.pt.

Only LABELED nodes (fraud/normal) are used — background nodes have no
real target and are excluded, same as during GNN training.
"""
import json
import os

import lightgbm as lgb
import numpy as np
import torch
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, average_precision_score, confusion_matrix,
)

GRAPH_PATH = "dgraph_fin_graph.pt"
METRICS_DIR = os.path.join(os.path.dirname(__file__), "..", "streamlit_app", "data")


def compute_metrics(labels, preds, probs):
    return {
        "accuracy": round(accuracy_score(labels, preds), 4),
        "precision": round(precision_score(labels, preds, zero_division=0), 4),
        "recall": round(recall_score(labels, preds, zero_division=0), 4),
        "f1": round(f1_score(labels, preds, zero_division=0), 4),
        "roc_auc": round(roc_auc_score(labels, probs), 4),
        "pr_auc": round(average_precision_score(labels, probs), 4),
        "confusion_matrix": confusion_matrix(labels, preds).tolist(),
    }


def main():
    print(f"Loading graph data from {GRAPH_PATH} (reusing its exact split)...")
    data = torch.load(GRAPH_PATH, weights_only=False)

    X = data.x.numpy()
    y = data.y.numpy()
    train_idx = data.train_mask.numpy()
    val_idx = data.val_mask.numpy()
    test_idx = data.test_mask.numpy()

    X_train, y_train = X[train_idx], y[train_idx]
    X_val, y_val = X[val_idx], y[val_idx]
    X_test, y_test = X[test_idx], y[test_idx]

    print(f"Train: {len(y_train):,} ({y_train.mean()*100:.2f}% fraud)")
    print(f"Val:   {len(y_val):,} ({y_val.mean()*100:.2f}% fraud)")
    print(f"Test:  {len(y_test):,} ({y_test.mean()*100:.2f}% fraud)")

    # DGraph-Fin's imbalance (78x) is more extreme than IEEE-CIS's (27x) —
    # the full undampened ratio caused LightGBM to badly over-predict
    # fraud (5.5% precision in the first attempt), the same overcorrection
    # already diagnosed and fixed for the GNN. Applying the same
    # sqrt-dampening fix here.
    full_ratio = (y_train == 0).sum() / max((y_train == 1).sum(), 1)
    scale_pos_weight = full_ratio ** 0.5
    print(f"scale_pos_weight: {scale_pos_weight:.2f} (full ratio would be {full_ratio:.2f}, sqrt-dampened)")

    train_set = lgb.Dataset(X_train, label=y_train)
    val_set = lgb.Dataset(X_val, label=y_val, reference=train_set)

    params = {
        "objective": "binary",
        "metric": "auc",
        "scale_pos_weight": scale_pos_weight,
        "num_leaves": 63,
        "learning_rate": 0.05,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        "verbose": -1,
    }

    print("\nTraining LightGBM (real early stopping, up to 4000 rounds)...")
    model = lgb.train(
        params, train_set, num_boost_round=4000,
        valid_sets=[val_set], valid_names=["val"],
        callbacks=[lgb.early_stopping(stopping_rounds=100), lgb.log_evaluation(period=100)],
    )

    print("\nEvaluating on held-out TEST set...")
    test_probs = model.predict(X_test, num_iteration=model.best_iteration)
    test_preds = (test_probs >= 0.5).astype(int)
    test_metrics = compute_metrics(y_test, test_preds, test_probs)

    print(f"\nFinal TEST metrics (LightGBM, tabular-only baseline):")
    for k, v in test_metrics.items():
        print(f"  {k}: {v}")

    os.makedirs(METRICS_DIR, exist_ok=True)
    model_path = os.path.join(os.path.dirname(__file__), "checkpoints", "dgraph_fin_lightgbm.txt")
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    model.save_model(model_path)
    print(f"\nSaved model to {model_path}")

    metrics_path = os.path.join(METRICS_DIR, "model_metrics_dgraph_fin_baseline.json")
    with open(metrics_path, "w") as f:
        json.dump({**test_metrics, "model": "LightGBM (tabular-only, no graph)"}, f, indent=2)
    print(f"Saved metrics to {metrics_path}")


if __name__ == "__main__":
    main()
