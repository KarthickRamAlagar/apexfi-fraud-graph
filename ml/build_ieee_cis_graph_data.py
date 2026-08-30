"""Build a PyTorch Geometric graph from gold.ieee_cis_features + edges.

Steps:
  1. Pull node features + labels from gold.ieee_cis_features.
  2. Clean/encode features: drop identifier columns (not real features),
     fill NaNs (V1-V339, C, D columns are frequently missing — this is
     real, not a bug, part of the original dataset), label-encode
     low/medium-cardinality categoricals, drop card1/deviceinfo as raw
     features (they're already captured structurally as edges — keeping
     them as both edges AND raw features would let the model "cheat" by
     memorizing identifiers rather than learning patterns).
  3. Pull edges from gold.ieee_cis_transaction_edges, map transactionid
     values to 0-indexed positions matching the node feature matrix.
  4. Stratified train/val/test split (70/15/15) by is_fraud, so each split
     keeps the same ~3.5% fraud rate.
  5. Save the resulting Data object to disk (ieee_cis_graph.pt) so we don't
     need to re-query Postgres and re-process every time we experiment.
"""
import numpy as np
import pandas as pd
import torch
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from torch_geometric.data import Data

from etl.db.connection import get_engine

OUTPUT_PATH = "ieee_cis_graph.pt"

# Columns that are identifiers / already captured as edges — exclude from
# the feature matrix to avoid the model "memorizing" identifiers instead of
# learning generalizable patterns.
DROP_COLS = {
    "transactionid", "is_fraud", "transactiondt", "transaction_date",
    "fiscal_year", "card1", "deviceinfo",
}

# Categorical columns needing label-encoding (numeric codes, not one-hot —
# keeps the feature matrix compact; GraphSAGE handles this fine).
CATEGORICAL_COLS = [
    "productcd", "card4", "card6", "p_emaildomain", "r_emaildomain",
    "devicetype", "id_12", "id_15", "id_16", "id_23", "id_27", "id_28",
    "id_29", "id_30", "id_31", "id_33", "id_34", "id_35", "id_36",
    "id_37", "id_38",
]


def main():
    engine = get_engine()

    print("Loading node features from gold.ieee_cis_features...")
    print("  (this pulls ~590K rows x ~440 columns through the DB driver — expect a few minutes)")
    chunks = []
    chunk_size = 20_000  # smaller chunks = lower peak memory per step, important on 8GB hardware
    for i, chunk in enumerate(pd.read_sql("SELECT * FROM gold.ieee_cis_features ORDER BY transactionid", engine, chunksize=chunk_size)):
        # Downcast to float32 IMMEDIATELY, before this chunk ever joins the
        # list — reading stays at float64 (pandas/the driver's default),
        # but we don't need to keep paying for that once the chunk is in
        # hand. Halves memory for every chunk held in the list, and for the
        # final concat below, which is what was hitting the 8GB ceiling.
        float_cols = chunk.select_dtypes(include=["float64"]).columns
        chunk[float_cols] = chunk[float_cols].astype(np.float32)
        chunks.append(chunk)
        if (i + 1) % 5 == 0:
            print(f"  ...{(i+1)*chunk_size:,} rows loaded (approx)")
    df = pd.concat(chunks, ignore_index=True)
    del chunks  # free the list explicitly rather than waiting on garbage collection
    print(f"  Loaded {len(df):,} rows, {len(df.columns)} columns")

    # node_id: 0-indexed position matching row order — this is what the
    # graph's edge_index will reference.
    transactionid_to_idx = {tid: i for i, tid in enumerate(df["transactionid"])}

    labels = df["is_fraud"].astype(int).values
    split = df["split"] if "split" in df.columns else None  # not present here; we split fresh below

    # Split computed HERE (before feature engineering) specifically so
    # frequency-encoded features below can be built from TRAINING rows
    # only — computing them across the whole dataset first would leak
    # val/test distribution information into the features, a subtle but
    # real form of data leakage.
    print("\nComputing train/val/test split early (needed for leak-free frequency encoding)...")
    indices = np.arange(len(df))
    train_idx, temp_idx = train_test_split(indices, test_size=0.3, stratify=labels, random_state=42)
    val_idx, test_idx = train_test_split(temp_idx, test_size=0.5, stratify=labels[temp_idx], random_state=42)

    # Frequency encoding: replace high-cardinality ID-like columns with
    # "how many training transactions share this exact value" — a real,
    # well-established technique from actual IEEE-CIS Kaggle-winning
    # solutions. Rare/unique values (low frequency) are a known real fraud
    # signal. Note: card1 and deviceinfo are excluded from RAW features
    # above (DROP_COLS) to avoid the model memorizing identifiers — but
    # their FREQUENCY is a legitimate aggregate statistic, not the same
    # as leaking the raw identifier, so it's fine to include here.
    print("Computing frequency-encoded features (from TRAINING rows only, to avoid leakage)...")
    FREQ_ENCODE_COLS = [
        "card1", "card2", "card3", "card5", "addr1", "addr2",
        "deviceinfo", "p_emaildomain", "r_emaildomain",
    ]
    freq_features = {}
    for col in FREQ_ENCODE_COLS:
        if col not in df.columns:
            continue
        train_counts = df.iloc[train_idx][col].value_counts()
        freq_col = df[col].map(train_counts).fillna(0).astype(np.float32)
        # log1p transform — raw counts can reach the tens of thousands
        # (e.g. a common card2 value shared by many transactions), while
        # other features are small decimals. Neural nets (unlike tree
        # models such as LightGBM) are genuinely sensitive to this kind of
        # scale mismatch — it can destabilize training outright. log1p is
        # the standard, well-established fix for skewed count features.
        freq_col = np.log1p(freq_col)
        freq_features[f"{col}_freq"] = freq_col.values
        print(f"  {col}_freq: {len(train_counts)} unique values in train (log1p-scaled)")

    # Boolean M1-M9 columns: True/False/None -> 1/0/-1 (a separate "unknown"
    # value rather than silently merging missing with False)
    m_cols = [f"m{i}" for i in range(1, 10)]
    for col in m_cols:
        df[col] = df[col].map({True: 1, False: 0}).fillna(-1)

    # Categorical columns: label-encode, missing -> a dedicated "missing" category
    for col in CATEGORICAL_COLS:
        if col not in df.columns:
            continue
        df[col] = df[col].fillna("__missing__").astype(str)
        df[col] = LabelEncoder().fit_transform(df[col])

    # Everything else numeric: fill NaN with 0 (V1-V339, C1-C14, D1-D15 etc.
    # are frequently missing in this dataset — 0 is a neutral placeholder;
    # a real model would ideally also add missingness-indicator columns,
    # left as a future refinement rather than blocking this first pass)
    feature_cols = [c for c in df.columns if c not in DROP_COLS and c != "split"]

    # By this point every remaining column is already numeric (categoricals
    # were label-encoded above, M1-M9 mapped to 1/0/-1) — re-running
    # pd.to_numeric across all 411 columns at once was redundant AND forced
    # pandas to rebuild the whole 590K x 411 block in one big np.vstack,
    # which is what caused the 1.81GB OOM. A plain fillna is far cheaper.
    numeric_df = df[feature_cols].fillna(0)

    print(f"  Final feature matrix: {numeric_df.shape[1]} columns")

    # float32, not float64 — GNN training doesn't need the extra precision,
    # and it halves the tensor's memory footprint
    x = torch.tensor(numeric_df.to_numpy(dtype=np.float32), dtype=torch.float)
    y = torch.tensor(labels, dtype=torch.long)
    feature_names = list(feature_cols)  # tracked alongside x, in the same order — used later so SHAP explanations say "TransactionAmt", not "feature_312"

    # Add the frequency-encoded features computed earlier
    if freq_features:
        freq_matrix = np.stack(list(freq_features.values()), axis=1)
        x = torch.cat([x, torch.tensor(freq_matrix, dtype=torch.float)], dim=1)
        feature_names += list(freq_features.keys())
        print(f"  Feature matrix after adding {len(freq_features)} frequency-encoded columns: {x.shape[1]} columns")

    # Free everything derived from df that we no longer need — by this
    # point x/y are already built as tensors, and transactionid_to_idx is
    # its own standalone dict. Holding the full 590K x ~450 column df in
    # memory through the edges step (17.3M rows on top of it) was the real
    # cause of the OOM here, not the edges step in isolation.
    num_nodes = len(df)
    transaction_ids_array = df["transactionid"].values.copy()
    del df, numeric_df, freq_features
    import gc
    gc.collect()
    print("  (freed feature DataFrame from memory — no longer needed)")

    print("\nLoading edges from gold.ieee_cis_transaction_edges...")
    print("  (17.3M rows — this takes a while; progress prints as it goes so it doesn't look hung)")
    edge_chunks = []
    edge_chunk_size = 50_000  # shrunk further given repeated OOM — trading speed for reliability
    for i, chunk in enumerate(
        pd.read_sql(
            "SELECT src_transactionid, dst_transactionid, edge_type FROM gold.ieee_cis_transaction_edges",
            engine, chunksize=edge_chunk_size,
        )
    ):
        # transaction IDs comfortably fit in int32 (well under its ~2.1
        # billion range) — halves memory for these two columns immediately,
        # same pattern as the float32 downcast above
        chunk["src_transactionid"] = chunk["src_transactionid"].astype(np.int32)
        chunk["dst_transactionid"] = chunk["dst_transactionid"].astype(np.int32)
        edge_chunks.append(chunk)
        if (i + 1) % 5 == 0:
            print(f"  ...{(i+1)*edge_chunk_size:,} edges loaded (approx)")
    edges_df = pd.concat(edge_chunks, ignore_index=True)
    del edge_chunks
    print(f"  Loaded {len(edges_df):,} edges")

    src = edges_df["src_transactionid"].map(transactionid_to_idx).values
    dst = edges_df["dst_transactionid"].map(transactionid_to_idx).values
    # PyG expects edges in both directions for undirected message passing
    edge_index = torch.tensor(
        np.concatenate([np.stack([src, dst]), np.stack([dst, src])], axis=1),
        dtype=torch.long,
    )

    # Real per-transaction connection counts, computed directly from the
    # edges we already loaded — added as explicit features because we
    # already established (earlier EDA) that device_shared connections
    # carry a real ~4x fraud lift, but the GNN was never actually given
    # this count directly; it only had raw V/C/D/card features before.
    print("\nComputing real degree-by-edge-type features from loaded edges...")
    device_degree = np.zeros(num_nodes, dtype=np.float32)
    card_degree = np.zeros(num_nodes, dtype=np.float32)
    for edge_type, degree_arr in [("device_shared", device_degree), ("card_shared", card_degree)]:
        type_edges = edges_df[edges_df["edge_type"] == edge_type]
        src_idx = type_edges["src_transactionid"].map(transactionid_to_idx).dropna().astype(int)
        dst_idx = type_edges["dst_transactionid"].map(transactionid_to_idx).dropna().astype(int)
        counts = np.bincount(
            np.concatenate([src_idx.values, dst_idx.values]), minlength=num_nodes
        )
        degree_arr[:] = counts
    print(
        f"  device_shared degree: mean={device_degree.mean():.2f}, max={device_degree.max():.0f}"
    )
    print(f"  card_shared degree: mean={card_degree.mean():.2f}, max={card_degree.max():.0f}")

    x = torch.cat(
        [x, torch.tensor(device_degree, dtype=torch.float).unsqueeze(1),
         torch.tensor(card_degree, dtype=torch.float).unsqueeze(1)],
        dim=1,
    )
    feature_names += ["device_shared_degree", "card_shared_degree"]
    print(f"  Feature matrix after adding degree features: {x.shape[1]} columns")

    train_mask = torch.zeros(num_nodes, dtype=torch.bool)
    val_mask = torch.zeros(num_nodes, dtype=torch.bool)
    test_mask = torch.zeros(num_nodes, dtype=torch.bool)
    train_mask[train_idx] = True
    val_mask[val_idx] = True
    test_mask[test_idx] = True

    data = Data(x=x, edge_index=edge_index, y=y)
    data.train_mask = train_mask
    data.val_mask = val_mask
    data.test_mask = test_mask
    # stored explicitly so any future script can align new features by
    # real transaction ID, not by trusting row order to stay consistent
    # across separate queries — a subtle correctness risk not worth
    # taking given this feeds into a publication
    data.transaction_ids = torch.tensor(transaction_ids_array, dtype=torch.long)
    data.feature_names = feature_names

    print(f"\nGraph summary:")
    print(f"  Nodes: {data.num_nodes:,}")
    print(f"  Edges (directed, incl. both directions): {data.num_edges:,}")
    print(f"  Features per node: {data.num_node_features}")
    print(f"  Train: {train_mask.sum():,} ({labels[train_idx].mean()*100:.2f}% fraud)")
    print(f"  Val:   {val_mask.sum():,} ({labels[val_idx].mean()*100:.2f}% fraud)")
    print(f"  Test:  {test_mask.sum():,} ({labels[test_idx].mean()*100:.2f}% fraud)")

    torch.save(data, OUTPUT_PATH)
    print(f"\nSaved graph to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()