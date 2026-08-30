"""The actual hybrid model: LightGBM trained on tabular features (now
including real degree counts) PLUS the GNN's learned embeddings —
combining what each model does well: LightGBM's strength at exploiting
fine-grained feature interactions, and the GNN's relational/graph-
structural awareness that pure tabular features can't see on their own.

Uses the SAME train/val/test split as both prior models (loaded straight
from ieee_cis_graph.pt) — essential for a fair, three-way comparison.
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

GRAPH_PATH = "ieee_cis_graph.pt"
EMBEDDINGS_PATH = "ml/checkpoints/ieee_cis_embeddings.pt"
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
    print(f"Loading graph data from {GRAPH_PATH}...")
    data = torch.load(GRAPH_PATH, weights_only=False)

    print(f"Loading GNN embeddings from {EMBEDDINGS_PATH}...")
    if not os.path.exists(EMBEDDINGS_PATH):
        print("Embeddings not found - run first: uv run python -m ml.extract_gnn_embeddings")
        return
    emb_data = torch.load(EMBEDDINGS_PATH, weights_only=False)
    embeddings = emb_data["embeddings"]
    emb_ids = emb_data["ids"]

    if not torch.equal(data.transaction_ids, emb_ids):
        print("ERROR: transaction ID order mismatch between graph and embeddings - refusing to proceed.")
        print("Re-run extract_gnn_embeddings.py against the current graph file.")
        return
    print("  Transaction ID alignment verified - safe to concatenate.")

    X_tabular = data.x.numpy()
    X_embeddings = embeddings.numpy()
    X = np.concatenate([X_tabular, X_embeddings], axis=1)
    y = data.y.numpy()

    print(f"Combined feature matrix: {X_tabular.shape[1]} tabular + {X_embeddings.shape[1]} GNN embedding dims = {X.shape[1]} total")

    train_idx = data.train_mask.numpy()
    val_idx = data.val_mask.numpy()
    test_idx = data.test_mask.numpy()

    X_train, y_train = X[train_idx], y[train_idx]
    X_val, y_val = X[val_idx], y[val_idx]
    X_test, y_test = X[test_idx], y[test_idx]

    scale_pos_weight = (y_train == 0).sum() / max((y_train == 1).sum(), 1)

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

    print("\nTraining hybrid LightGBM (tabular + GNN embeddings)...")
    model = lgb.train(
        params, train_set, num_boost_round=4000,
        valid_sets=[val_set], valid_names=["val"],
        callbacks=[lgb.early_stopping(stopping_rounds=100), lgb.log_evaluation(period=100)],
    )

    print("\nEvaluating on held-out TEST set...")
    test_probs = model.predict(X_test, num_iteration=model.best_iteration)
    test_preds = (test_probs >= 0.5).astype(int)
    test_metrics = compute_metrics(y_test, test_preds, test_probs)

    print(f"\nFinal TEST metrics (Hybrid: LightGBM + GNN embeddings):")
    for k, v in test_metrics.items():
        print(f"  {k}: {v}")

    importances = model.feature_importance(importance_type="gain")
    n_tabular = X_tabular.shape[1]
    tabular_importance = importances[:n_tabular].sum()
    embedding_importance = importances[n_tabular:].sum()
    total = tabular_importance + embedding_importance
    print(f"\nFeature importance split (by total gain):")
    print(f"  Tabular features: {tabular_importance / total * 100:.1f}%")
    print(f"  GNN embedding dims: {embedding_importance / total * 100:.1f}%")

    os.makedirs(METRICS_DIR, exist_ok=True)
    model_path = os.path.join(os.path.dirname(__file__), "checkpoints", "ieee_cis_hybrid.txt")
    model.save_model(model_path)
    print(f"\nSaved model to {model_path}")

    metrics_path = os.path.join(METRICS_DIR, "model_metrics_ieee_cis_hybrid.json")
    with open(metrics_path, "w") as f:
        json.dump(
            {
                **test_metrics,
                "model": "Hybrid: LightGBM + GNN embeddings",
                "gnn_embedding_importance_pct": round(embedding_importance / total * 100, 1),
            },
            f, indent=2,
        )
    print(f"Saved metrics to {metrics_path}")


if __name__ == "__main__":
    main()
