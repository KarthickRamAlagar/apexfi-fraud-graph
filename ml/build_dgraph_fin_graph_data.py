"""Build a PyTorch Geometric graph from gold.dgraph_fin_nodes + edges.

Mirrors build_ieee_cis_graph_data.py's structure. Key differences from
IEEE-CIS:
  - Only nodes labeled 'fraud' or 'normal' have a real ground-truth label
    usable for training — 'background' nodes (2.47M of the 3.7M total) are
    unlabeled by design in the source dataset, not missing data. They're
    kept in the graph (their features/structure still help message-passing
    for their labeled neighbors) but excluded from the train/val/test
    masks and from the loss.
  - node_timestamp is real but only populated for fraud nodes (fraud-onset
    signal) — filled with 0 for everyone else rather than dropped, since a
    missingness pattern here is itself informative, not noise to hide.
"""
import numpy as np
import pandas as pd
import torch
from sklearn.model_selection import train_test_split
from torch_geometric.data import Data

from etl.db.connection import get_engine

OUTPUT_PATH = "dgraph_fin_graph.pt"


def main():
    engine = get_engine()

    print("Loading node features from gold.dgraph_fin_nodes...")
    print("  (3.7M rows — expect a few minutes)")
    chunks = []
    chunk_size = 200_000
    for i, chunk in enumerate(pd.read_sql("SELECT * FROM gold.dgraph_fin_nodes", engine, chunksize=chunk_size)):
        chunks.append(chunk)
        print(f"  ...{(i+1)*chunk_size:,} rows loaded (approx)")
    df = pd.concat(chunks, ignore_index=True)
    print(f"  Loaded {len(df):,} rows, {len(df.columns)} columns")

    node_id_to_idx = {nid: i for i, nid in enumerate(df["node_id"])}

    # label_raw: 0=fraud, 1=normal, 2/3=background/unlabeled (per the
    # original DGraph-Fin encoding, carried into Gold specifically so we
    # have a real numeric target without re-deriving it from the text label)
    is_labeled = df["label"].isin(["fraud", "normal"])
    y = torch.full((len(df),), -1, dtype=torch.long)  # -1 = no real label
    y[df["label"] == "fraud"] = 1
    y[df["label"] == "normal"] = 0

    feature_cols = [c for c in df.columns if c.startswith("x")]
    x_features = df[feature_cols].fillna(0).values

    total_degree = df["total_degree"].fillna(0).values.reshape(-1, 1)
    node_timestamp = df["node_timestamp"].fillna(0).values.reshape(-1, 1)  # real, sparse-on-purpose

    x = torch.tensor(
        np.concatenate([x_features, total_degree, node_timestamp], axis=1), dtype=torch.float
    )
    print(f"  Final feature matrix: {x.shape[1]} columns ({len(feature_cols)} x-features + degree + timestamp)")

    print("\nLoading edges from gold.dgraph_fin_edges...")
    print("  (4.3M rows — progress prints as it goes so it doesn't look hung)")
    edge_chunks = []
    edge_chunk_size = 500_000
    for i, chunk in enumerate(
        pd.read_sql(
            "SELECT src_node_id, dst_node_id FROM gold.dgraph_fin_edges",
            engine, chunksize=edge_chunk_size,
        )
    ):
        edge_chunks.append(chunk)
        print(f"  ...{(i+1)*edge_chunk_size:,} edges loaded (approx)")
    edges_df = pd.concat(edge_chunks, ignore_index=True)
    print(f"  Loaded {len(edges_df):,} edges")

    src = edges_df["src_node_id"].map(node_id_to_idx).values
    dst = edges_df["dst_node_id"].map(node_id_to_idx).values
    valid = ~(np.isnan(src) | np.isnan(dst))
    src, dst = src[valid].astype(int), dst[valid].astype(int)
    edge_index = torch.tensor(
        np.concatenate([np.stack([src, dst]), np.stack([dst, src])], axis=1), dtype=torch.long
    )

    print("\nBuilding stratified train/val/test split (70/15/15) — LABELED nodes only...")
    labeled_indices = np.where(is_labeled.values)[0]
    labeled_y = y[labeled_indices].numpy()

    train_idx, temp_idx = train_test_split(labeled_indices, test_size=0.3, stratify=labeled_y, random_state=42)
    val_idx, test_idx = train_test_split(
        temp_idx, test_size=0.5, stratify=y[temp_idx].numpy(), random_state=42
    )

    train_mask = torch.zeros(len(df), dtype=torch.bool)
    val_mask = torch.zeros(len(df), dtype=torch.bool)
    test_mask = torch.zeros(len(df), dtype=torch.bool)
    train_mask[train_idx] = True
    val_mask[val_idx] = True
    test_mask[test_idx] = True

    data = Data(x=x, edge_index=edge_index, y=y)
    data.train_mask = train_mask
    data.val_mask = val_mask
    data.test_mask = test_mask
    # stored explicitly so future scripts (embedding extraction, stacking)
    # can align by real node ID rather than trusting row order to stay
    # consistent across separate queries
    data.node_ids = torch.tensor(df["node_id"].values, dtype=torch.long)

    print(f"\nGraph summary:")
    print(f"  Nodes: {data.num_nodes:,} (labeled: {is_labeled.sum():,}, unlabeled/background: {(~is_labeled).sum():,})")
    print(f"  Edges (directed, incl. both directions): {data.num_edges:,}")
    print(f"  Features per node: {data.num_node_features}")
    print(f"  Train: {train_mask.sum():,} ({y[train_idx].float().mean()*100:.2f}% fraud)")
    print(f"  Val:   {val_mask.sum():,} ({y[val_idx].float().mean()*100:.2f}% fraud)")
    print(f"  Test:  {test_mask.sum():,} ({y[test_idx].float().mean()*100:.2f}% fraud)")

    torch.save(data, OUTPUT_PATH)
    print(f"\nSaved graph to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
