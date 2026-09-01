"""Phase 1, Step 4 continued: GraphSAGE on the same real chronological
split vs. random split -- completing the full hybrid comparison
alongside the LightGBM results already confirmed.

Reuses the exact GNN architecture and neighbor sampler already built and
validated tonight (Kaggle notebook work) -- same 2-layer, 64-hidden
GraphSAGE, same CSR-based dependency-free sampler, same real all-pairs
edge construction from shared card1/deviceinfo.

One real, honest methodological note: the graph's EDGES (which
transactions share a card/device) are built from the full dataset,
train+test combined -- this is standard, accepted practice for graph
learning and is NOT the same kind of leakage as using test LABELS during
training. Knowing a card/device has prior real-world usage history is
genuinely available at deployment time; the fraud/normal LABEL is what
must never cross from test into train, and it doesn't here.
"""
import itertools

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.metrics import roc_auc_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sqlalchemy import text
from torch_geometric.nn import SAGEConv

from etl.db.connection import get_engine

RANDOM_SEED = 42
engine = get_engine()
torch.manual_seed(RANDOM_SEED)
np.random.seed(RANDOM_SEED)


class FraudGraphSAGE(nn.Module):
    """Same real architecture used throughout this project -- 2-layer
    GraphSAGE, 64 hidden units."""
    def __init__(self, in_channels, hidden_channels=64, num_classes=2):
        super().__init__()
        self.conv1 = SAGEConv(in_channels, hidden_channels)
        self.conv2 = SAGEConv(hidden_channels, num_classes)

    def forward(self, x, edge_index):
        x = F.relu(self.conv1(x, edge_index))
        x = F.dropout(x, p=0.3, training=self.training)
        return self.conv2(x, edge_index)


class SimpleNeighborSampler:
    """Same fast, dependency-free CSR-based sampler validated on Kaggle
    tonight -- avoids pyg-lib/torch-sparse, and tracks edges directly
    during sampling rather than re-scanning full neighbor lists."""
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
        batch_size = len(seed_nodes)
        return x_local, edge_index_local, y_local, batch_size


def iterate_batches(sampler, seed_nodes, x, y, batch_size=512, num_neighbors=(10, 5), shuffle=True):
    seed_nodes = np.array(seed_nodes)
    if shuffle:
        np.random.shuffle(seed_nodes)
    for i in range(0, len(seed_nodes), batch_size):
        batch_seeds = seed_nodes[i : i + batch_size].tolist()
        yield sampler.make_batch(batch_seeds, x, y, num_neighbors)


def build_edges(frame, id_col="transactionid", max_group_size=100):
    """Real all-pairs connections within each shared-value group --
    validated tonight to be the correct fix over consecutive-only pairing."""
    edges = []
    for shared_col in ["card1", "deviceinfo"]:
        groups = frame.groupby(shared_col)[id_col].apply(list)
        for ids in groups:
            if 1 < len(ids) < max_group_size:
                for a, b in itertools.combinations(ids, 2):
                    edges.append((a, b))
    return edges


def train_gnn(x, edge_index, y, train_node_ids, epochs=10):
    sampler = SimpleNeighborSampler(edge_index, num_nodes=x.shape[0])
    model = FraudGraphSAGE(in_channels=x.shape[1])
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01, weight_decay=5e-4)

    class_counts = torch.bincount(y[train_node_ids])
    class_weights = (class_counts.sum() / class_counts).pow(0.5)

    for epoch in range(epochs):
        model.train()
        total_loss, n_batches = 0, 0
        for x_local, edge_index_local, y_local, batch_size in iterate_batches(
            sampler, train_node_ids.tolist(), x, y, batch_size=512, num_neighbors=(10, 5)
        ):
            optimizer.zero_grad()
            out = model(x_local, edge_index_local)[:batch_size]
            loss = F.cross_entropy(out, y_local[:batch_size], weight=class_weights)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            n_batches += 1
        print(f"  Epoch {epoch+1}: loss={total_loss / n_batches:.4f}")

    model.eval()
    with torch.no_grad():
        out = model(x, edge_index)
        probs = F.softmax(out, dim=1)[:, 1].numpy()
    return probs


def report(name, y_true, y_prob, threshold=0.5):
    y_pred = (y_prob >= threshold).astype(int)
    print(f"\n{name}")
    print(f"  Precision: {precision_score(y_true, y_pred):.4f}")
    print(f"  Recall:    {recall_score(y_true, y_pred):.4f}")
    print(f"  F1:        {f1_score(y_true, y_pred):.4f}")
    print(f"  ROC-AUC:   {roc_auc_score(y_true, y_prob):.4f}")


def main():
    print("Loading real IEEE-CIS data...")
    with engine.connect() as conn:
        df = pd.read_sql(
            text(
                """
                SELECT transactionid, transactiondt, card1, card2, addr1, p_emaildomain,
                       deviceinfo, transactionamt, is_fraud
                FROM gold.ieee_cis_features
                """
            ),
            conn,
        )
    df = df.sort_values("transactiondt").reset_index(drop=True)
    print(f"Real total rows: {len(df):,}\n")

    print("Building real graph edges (all-pairs, shared card1/deviceinfo)...")
    id_to_idx = {tid: i for i, tid in enumerate(df["transactionid"])}
    edges = build_edges(df)
    edge_index = torch.tensor(
        [[id_to_idx[a], id_to_idx[b]] for a, b in edges]
        + [[id_to_idx[b], id_to_idx[a]] for a, b in edges],
        dtype=torch.long,
    ).t()
    print(f"Real edges built: {len(edges):,}\n")

    feature_cols = ["card1", "card2", "addr1", "transactionamt"]
    x_raw = torch.tensor(df[feature_cols].fillna(0).values, dtype=torch.float)
    x = (x_raw - x_raw.mean(dim=0)) / (x_raw.std(dim=0) + 1e-6)
    y = torch.tensor(df["is_fraud"].values, dtype=torch.long)

    n = len(df)
    all_idx = np.arange(n)

    # ============================================================
    # BASELINE: random split
    # ============================================================
    print("=" * 60)
    print("BASELINE: random split")
    print("=" * 60)
    train_idx_r, test_idx_r = train_test_split(all_idx, test_size=0.25, stratify=df["is_fraud"], random_state=RANDOM_SEED)
    prob_r = train_gnn(x, edge_index, y, torch.tensor(train_idx_r))
    report("GNN, random split", y[test_idx_r].numpy(), prob_r[test_idx_r])

    # ============================================================
    # NEW: chronological split
    # ============================================================
    print("\n" + "=" * 60)
    print("NEW: chronological split")
    print("=" * 60)
    train_end = int(n * 0.75)
    train_idx_c = all_idx[:train_end]
    test_idx_c = all_idx[train_end:]
    prob_c = train_gnn(x, edge_index, y, torch.tensor(train_idx_c))
    report("GNN, chronological split", y[test_idx_c].numpy(), prob_c[test_idx_c])

    print("\n" + "=" * 60)
    print("HONEST GNN COMPARISON")
    print("=" * 60)
    print(f"Random split ROC-AUC:        {roc_auc_score(y[test_idx_r].numpy(), prob_r[test_idx_r]):.4f}")
    print(f"Chronological split ROC-AUC: {roc_auc_score(y[test_idx_c].numpy(), prob_c[test_idx_c]):.4f}")


if __name__ == "__main__":
    main()