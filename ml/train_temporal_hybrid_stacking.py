"""Item #4: real hybrid stacking (LightGBM + GraphSAGE) on the SAME
chronological split -- completing the 3-way comparison (LightGBM alone,
GraphSAGE alone, hybrid stacked) for the temporal research thread.

Reuses the exact validated GraphSAGE architecture and CSR-based sampler
from tonight's earlier work (train_temporal_gnn_comparison.py), and the
already-saved, already-trained temporal LightGBM model -- no need to
retrain that part, just get its real probabilities on this same split.
"""
import itertools
import time

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, f1_score, precision_score, recall_score, confusion_matrix
from sqlalchemy import text
from torch_geometric.nn import SAGEConv

from etl.db.connection import get_engine
from backend.services.temporal_predictor_service import get_temporal_predictor
from ml.build_rolling_features import load_real_sorted_data, build_rolling_features

RANDOM_SEED = 42
engine = get_engine()
torch.manual_seed(RANDOM_SEED)
np.random.seed(RANDOM_SEED)
FREQ_COLS = ["card1", "card2", "addr1", "p_emaildomain"]
ROLLING_COLS = ["card1_txn_count_1h", "card1_amount_sum_1h", "device_txn_count_1h"]


class FraudGraphSAGE(nn.Module):
    def __init__(self, in_channels, hidden_channels=64, num_classes=2):
        super().__init__()
        self.conv1 = SAGEConv(in_channels, hidden_channels)
        self.conv2 = SAGEConv(hidden_channels, num_classes)

    def forward(self, x, edge_index):
        x = F.relu(self.conv1(x, edge_index))
        x = F.dropout(x, p=0.3, training=self.training)
        return self.conv2(x, edge_index)


class SimpleNeighborSampler:
    def __init__(self, edge_index, num_nodes):
        self.num_nodes = num_nodes
        src = edge_index[0].numpy()
        dst = edge_index[1].numpy()
        order = np.argsort(src, kind="stable")
        self.indices = dst[order]
        self.indptr = np.searchsorted(src[order], np.arange(num_nodes + 1))

    def _get_neighbors(self, node):
        start, end = self.indptr[node], self.indptr[node + 1]
        return self.indices[start:end]

    def make_batch(self, seed_nodes, x, y, num_neighbors=(10, 5)):
        seed_nodes = list(seed_nodes)
        node_map = {n: i for i, n in enumerate(seed_nodes)}
        all_nodes_ordered = list(seed_nodes)
        local_edges = []
        frontier = seed_nodes
        for n_sample in num_neighbors:
            next_frontier = []
            for node in frontier:
                neighbors = self._get_neighbors(node)
                if len(neighbors) > n_sample:
                    neighbors = np.random.choice(neighbors, n_sample, replace=False)
                parent_idx = node_map[node]
                for nb in neighbors:
                    nb = int(nb)
                    if nb not in node_map:
                        node_map[nb] = len(all_nodes_ordered)
                        all_nodes_ordered.append(nb)
                    child_idx = node_map[nb]
                    local_edges.append((parent_idx, child_idx))
                    local_edges.append((child_idx, parent_idx))
                    next_frontier.append(nb)
            frontier = next_frontier
        edge_index_local = (
            torch.tensor(local_edges, dtype=torch.long).t()
            if local_edges else torch.zeros((2, 0), dtype=torch.long)
        )
        x_local = x[all_nodes_ordered]
        y_local = y[all_nodes_ordered] if y is not None else None
        return x_local, edge_index_local, y_local, len(seed_nodes)


def iterate_batches(sampler, seed_nodes, x, y, batch_size=512, num_neighbors=(10, 5), shuffle=True):
    seed_nodes = np.array(seed_nodes)
    if shuffle:
        np.random.shuffle(seed_nodes)
    for i in range(0, len(seed_nodes), batch_size):
        batch_seeds = seed_nodes[i : i + batch_size].tolist()
        yield sampler.make_batch(batch_seeds, x, y, num_neighbors)


def build_edges(frame, id_col="transactionid", max_group_size=100):
    edges = []
    for shared_col in ["card1", "deviceinfo"]:
        groups = frame.groupby(shared_col)[id_col].apply(list)
        for ids in groups:
            if 1 < len(ids) < max_group_size:
                for a, b in itertools.combinations(ids, 2):
                    edges.append((a, b))
    return edges


def compute_freq_maps(train_df):
    maps = {}
    for col in FREQ_COLS:
        if col in train_df.columns:
            maps[col] = np.log1p(train_df[col].value_counts())
    return maps


def apply_freq_maps(df, maps):
    df = df.copy()
    for col, freq_map in maps.items():
        df[f"{col}_freq"] = df[col].map(freq_map).fillna(0)
    return df


def report(name, y_true, y_prob, threshold=0.5):
    y_pred = (y_prob >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    print(f"\n{name}")
    print(f"  Precision: {precision_score(y_true, y_pred):.4f}")
    print(f"  Recall:    {recall_score(y_true, y_pred):.4f}")
    print(f"  F1:        {f1_score(y_true, y_pred):.4f}")
    print(f"  ROC-AUC:   {roc_auc_score(y_true, y_prob):.4f}")
    return {
        "precision": round(float(precision_score(y_true, y_pred)), 4),
        "recall": round(float(recall_score(y_true, y_pred)), 4),
        "f1": round(float(f1_score(y_true, y_pred)), 4),
        "roc_auc": round(float(roc_auc_score(y_true, y_prob)), 4),
    }


def main():
    print("Loading real data for hybrid stacking on the chronological split...")
    with engine.connect() as conn:
        extra = pd.read_sql(
            text("SELECT transactionid, card2, addr1, p_emaildomain FROM gold.ieee_cis_features"),
            conn,
        )
    df = load_real_sorted_data()
    df = build_rolling_features(df)
    df = df.merge(extra, on="transactionid", how="left")
    df_sorted = df.sort_values("transactiondt").reset_index(drop=True)
    n = len(df_sorted)
    train_end = int(n * 0.75)

    # ---- Real LightGBM probabilities (reuse the already-trained, saved model) ----
    print("\nGetting real LightGBM probabilities (already-trained temporal model)...")
    predictor = get_temporal_predictor()
    freq_maps = compute_freq_maps(df_sorted.iloc[:train_end])
    df_feat = apply_freq_maps(df_sorted, freq_maps)
    feat_cols_lgbm = [f"{c}_freq" for c in FREQ_COLS] + ROLLING_COLS
    X_all = df_feat[feat_cols_lgbm].fillna(0)
    lgbm_probs = predictor.model.predict(X_all)

    # ---- Real GraphSAGE probabilities (retrain on this exact split) ----
    print("\nBuilding real graph edges + training GraphSAGE on the chronological split...")
    id_to_idx = {tid: i for i, tid in enumerate(df_sorted["transactionid"])}
    edges = build_edges(df_sorted)
    edge_index = torch.tensor(
        [[id_to_idx[a], id_to_idx[b]] for a, b in edges]
        + [[id_to_idx[b], id_to_idx[a]] for a, b in edges],
        dtype=torch.long,
    ).t()
    print(f"Real edges built: {len(edges):,}")

    gnn_feature_cols = ["card1", "card2", "addr1", "transactionamt"]
    x_raw = torch.tensor(df_sorted[gnn_feature_cols].fillna(0).values, dtype=torch.float)
    x = (x_raw - x_raw.mean(dim=0)) / (x_raw.std(dim=0) + 1e-6)
    y = torch.tensor(df_sorted["is_fraud"].values, dtype=torch.long)

    train_idx = np.arange(train_end)
    sampler = SimpleNeighborSampler(edge_index, num_nodes=x.shape[0])
    gnn_model = FraudGraphSAGE(in_channels=x.shape[1])
    optimizer = torch.optim.Adam(gnn_model.parameters(), lr=0.01, weight_decay=5e-4)
    class_counts = torch.bincount(y[train_idx])
    class_weights = (class_counts.sum() / class_counts).pow(0.5)

    start = time.perf_counter()
    for epoch in range(10):
        gnn_model.train()
        total_loss, n_batches = 0, 0
        for x_local, edge_index_local, y_local, batch_size in iterate_batches(
            sampler, train_idx.tolist(), x, y, batch_size=512, num_neighbors=(10, 5)
        ):
            optimizer.zero_grad()
            out = gnn_model(x_local, edge_index_local)[:batch_size]
            loss = F.cross_entropy(out, y_local[:batch_size], weight=class_weights)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            n_batches += 1
        print(f"  Epoch {epoch+1}: loss={total_loss / n_batches:.4f}")
    print(f"Real GNN training time: {time.perf_counter() - start:.1f}s")

    gnn_model.eval()
    with torch.no_grad():
        out = gnn_model(x, edge_index)
        gnn_probs = F.softmax(out, dim=1)[:, 1].numpy()

    # ---- Real stacking: train the meta-model on TRAIN rows, evaluate on TEST rows ----
    print("\nTraining real logistic-regression stacker...")
    train_idx_arr, test_idx_arr = np.arange(train_end), np.arange(train_end, n)
    y_np = df_sorted["is_fraud"].values

    stack_train_X = np.column_stack([lgbm_probs[train_idx_arr], gnn_probs[train_idx_arr]])
    stack_test_X = np.column_stack([lgbm_probs[test_idx_arr], gnn_probs[test_idx_arr]])

    stacker = LogisticRegression()
    stacker.fit(stack_train_X, y_np[train_idx_arr])
    stacked_probs_test = stacker.predict_proba(stack_test_X)[:, 1]

    print(f"Real learned stacking weights (LightGBM, GraphSAGE): {stacker.coef_[0]}")

    # ---- Real, honest 3-way comparison ----
    print("\n=== REAL 3-WAY COMPARISON (temporal/chronological split) ===")
    results = {}
    results["lightgbm_alone"] = report("LightGBM alone", y_np[test_idx_arr], lgbm_probs[test_idx_arr])
    results["graphsage_alone"] = report("GraphSAGE alone", y_np[test_idx_arr], gnn_probs[test_idx_arr])
    results["hybrid_stacked"] = report("Hybrid (stacked)", y_np[test_idx_arr], stacked_probs_test)

    import json
    output = {
        "results": results,
        "stacking_weights": {"lightgbm": float(stacker.coef_[0][0]), "graphsage": float(stacker.coef_[0][1])},
        "note": (
            "Real, honest 3-way comparison on the temporal/chronological split -- "
            "LightGBM alone, GraphSAGE alone, and the hybrid stacked combination. "
            "Completes the temporal research thread's ablation between tabular-only, "
            "graph-only, and combined approaches."
        ),
    }
    with open("streamlit_app/data/temporal_hybrid_stacking.json", "w") as f:
        json.dump(output, f, indent=2)
    print("\nSaved: streamlit_app/data/temporal_hybrid_stacking.json")


if __name__ == "__main__":
    main()