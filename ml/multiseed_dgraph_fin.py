"""Multi-seed validation for DGraph-Fin's winning pipeline (LightGBM +
stacking). Same scoping as multiseed_ieee_cis.py — only LightGBM's own
training randomness varies; the GNN's probabilities (single validated
checkpoint) are reused across all seeds.

NOTE: unlike IEEE-CIS, DGraph-Fin's GNN was trained on RAW (unnormalized)
features and works correctly that way — no frequency-encoding scale
explosion here. Deliberately NOT applying normalize_features, to match
how it was actually trained (see stack_dgraph_fin.py for the same
reasoning).
"""
import json

import lightgbm as lgb
import numpy as np
import torch
import torch.nn.functional as F
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score, average_precision_score

from ml.model import FraudGraphSAGE
from ml.simple_sampler import SimpleNeighborLoader, SharedEdgeStructure

GRAPH_PATH = "dgraph_fin_graph.pt"
SEEDS = [42, 123, 777]


@torch.no_grad()
def get_gnn_probs(model, data, mask, edge_structure, num_neighbors=(10, 5), batch_size=512):
    model.eval()
    loader = SimpleNeighborLoader(data, num_neighbors=list(num_neighbors), batch_size=batch_size, input_nodes=mask, shuffle=False, edge_structure=edge_structure)
    all_probs = []
    for batch in loader:
        out = model(batch.x, batch.edge_index)[: batch.batch_size]
        all_probs.append(F.softmax(out, dim=1)[:, 1])
    return torch.cat(all_probs).numpy()


def metrics(labels, preds, probs):
    return {
        "precision": precision_score(labels, preds, zero_division=0),
        "recall": recall_score(labels, preds, zero_division=0),
        "f1": f1_score(labels, preds, zero_division=0),
        "roc_auc": roc_auc_score(labels, probs),
        "pr_auc": average_precision_score(labels, probs),
    }


def train_lightgbm(X_train, y_train, X_val, y_val, seed):
    # DGraph-Fin's imbalance (78x) needed sqrt-dampening, same fix already
    # established in train_dgraph_fin_baseline.py
    full_ratio = (y_train == 0).sum() / max((y_train == 1).sum(), 1)
    scale_pos_weight = full_ratio ** 0.5
    params = {
        "objective": "binary", "metric": "auc", "scale_pos_weight": scale_pos_weight,
        "num_leaves": 63, "learning_rate": 0.05, "feature_fraction": 0.8,
        "bagging_fraction": 0.8, "bagging_freq": 5, "verbose": -1,
        "seed": seed, "bagging_seed": seed, "feature_fraction_seed": seed,
    }
    train_set = lgb.Dataset(X_train, label=y_train)
    val_set = lgb.Dataset(X_val, label=y_val, reference=train_set)
    return lgb.train(
        params, train_set, num_boost_round=4000, valid_sets=[val_set],
        callbacks=[lgb.early_stopping(stopping_rounds=100, verbose=False)],
    )


def main():
    print("Loading graph, precomputing GNN probabilities once (reused across all seeds)...")
    data = torch.load(GRAPH_PATH, weights_only=False)
    checkpoint = torch.load("ml/checkpoints/dgraph_fin_model.pt", weights_only=False)
    gnn = FraudGraphSAGE(in_channels=checkpoint["in_channels"], hidden_channels=checkpoint["hidden_channels"])
    gnn.load_state_dict(checkpoint["state_dict"])

    shared_edges = SharedEdgeStructure(data.edge_index, data.num_nodes)  # raw data, no normalization

    X = data.x.numpy()
    y = data.y.numpy()
    train_idx, val_idx, test_idx = data.train_mask.numpy(), data.val_mask.numpy(), data.test_mask.numpy()
    X_train, y_train = X[train_idx], y[train_idx]
    X_val, y_val = X[val_idx], y[val_idx]
    X_test, y_test = X[test_idx], y[test_idx]

    gnn_val_probs = get_gnn_probs(gnn, data, data.val_mask, shared_edges)
    gnn_test_probs = get_gnn_probs(gnn, data, data.test_mask, shared_edges)
    print("  done")

    lgbm_results, stacked_results = [], []

    for seed in SEEDS:
        print(f"\n=== Seed {seed} ===")
        model = train_lightgbm(X_train, y_train, X_val, y_val, seed)
        lgbm_val_probs = model.predict(X_val, num_iteration=model.best_iteration)
        lgbm_test_probs = model.predict(X_test, num_iteration=model.best_iteration)

        lgbm_preds = (lgbm_test_probs >= 0.5).astype(int)
        lgbm_m = metrics(y_test, lgbm_preds, lgbm_test_probs)
        lgbm_results.append(lgbm_m)
        print(f"  LightGBM: F1={lgbm_m['f1']:.4f} precision={lgbm_m['precision']:.4f} roc_auc={lgbm_m['roc_auc']:.4f}")

        meta = LogisticRegression()
        meta.fit(np.stack([lgbm_val_probs, gnn_val_probs], axis=1), y_val)
        stacked_probs = meta.predict_proba(np.stack([lgbm_test_probs, gnn_test_probs], axis=1))[:, 1]
        stacked_preds = (stacked_probs >= 0.5).astype(int)
        stacked_m = metrics(y_test, stacked_preds, stacked_probs)
        stacked_results.append(stacked_m)
        print(f"  Stacked:  F1={stacked_m['f1']:.4f} precision={stacked_m['precision']:.4f} roc_auc={stacked_m['roc_auc']:.4f}")

    def summarize(results, name):
        print(f"\n{name} across {len(SEEDS)} seeds:")
        summary = {}
        for key in ["precision", "recall", "f1", "roc_auc", "pr_auc"]:
            vals = [r[key] for r in results]
            mean, std = np.mean(vals), np.std(vals)
            summary[key] = {"mean": round(mean, 4), "std": round(std, 4)}
            print(f"  {key}: {mean:.4f} ± {std:.4f}")
        return summary

    lgbm_summary = summarize(lgbm_results, "LightGBM alone")
    stacked_summary = summarize(stacked_results, "Stacked")

    with open("streamlit_app/data/multiseed_dgraph_fin.json", "w") as f:
        json.dump(
            {"seeds": SEEDS, "lightgbm": lgbm_summary, "stacked": stacked_summary,
             "note": "GNN reused a single validated checkpoint across all seeds. LightGBM's own training randomness varied per seed; train/val/test split held fixed."},
            f, indent=2,
        )
    print("\nSaved to streamlit_app/data/multiseed_dgraph_fin.json")


if __name__ == "__main__":
    main()