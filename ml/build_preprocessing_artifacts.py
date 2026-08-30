"""Extracts and saves the REUSABLE preprocessing artifacts used to build
ieee_cis_graph.pt — frequency lookup tables, categorical label-encoder
mappings, and the canonical feature schema (names + defaults + order).

Why this needs to exist separately from build_ieee_cis_graph_data.py:
that script computes these exact same things internally, but throws them
away once the graph tensor is built — they were never saved on their own.
For scoring a genuinely NEW transaction (one not in the training data),
we need these same training-derived mappings available at inference time,
WITHOUT recomputing them from scratch (that would either be impossible —
a new transaction alone can't reproduce a frequency table — or would
reintroduce data leakage if computed from combined old+new data).

Uses the exact same DROP_COLS / CATEGORICAL_COLS / FREQ_ENCODE_COLS /
train split (random_state=42) as build_ieee_cis_graph_data.py, so the
resulting artifacts are guaranteed consistent with the trained model.
"""
import json
import pickle

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

from etl.db.connection import get_engine

OUTPUT_PATH = "ml/checkpoints/ieee_cis_preprocessing_artifacts.pkl"

DROP_COLS = {
    "transactionid", "is_fraud", "transactiondt", "transaction_date",
    "fiscal_year", "card1", "deviceinfo",
}

CATEGORICAL_COLS = [
    "productcd", "card4", "card6", "p_emaildomain", "r_emaildomain",
    "devicetype", "id_12", "id_15", "id_16", "id_23", "id_27", "id_28",
    "id_29", "id_30", "id_31", "id_33", "id_34", "id_35", "id_36",
    "id_37", "id_38",
]

FREQ_ENCODE_COLS = [
    "card1", "card2", "card3", "card5", "addr1", "addr2",
    "deviceinfo", "p_emaildomain", "r_emaildomain",
]

M_COLS = [f"m{i}" for i in range(1, 10)]


def main():
    engine = get_engine()

    print("Loading node features from gold.ieee_cis_features...")
    print("  (same chunked/downcast loading as the graph builder, to avoid repeat OOM)")
    chunks = []
    chunk_size = 20_000
    for i, chunk in enumerate(pd.read_sql("SELECT * FROM gold.ieee_cis_features ORDER BY transactionid", engine, chunksize=chunk_size)):
        float_cols = chunk.select_dtypes(include=["float64"]).columns
        chunk[float_cols] = chunk[float_cols].astype(np.float32)
        chunks.append(chunk)
        if (i + 1) % 5 == 0:
            print(f"  ...{(i+1)*chunk_size:,} rows loaded (approx)")
    df = pd.concat(chunks, ignore_index=True)
    del chunks
    print(f"  Loaded {len(df):,} rows, {len(df.columns)} columns")

    labels = df["is_fraud"].astype(int).values

    # SAME split as the graph builder (random_state=42) — critical that
    # this matches exactly, since these are meant to be the identical
    # training-derived artifacts the trained model actually saw.
    print("\nRecomputing the same train/val/test split (random_state=42, must match graph builder)...")
    indices = np.arange(len(df))
    train_idx, temp_idx = train_test_split(indices, test_size=0.3, stratify=labels, random_state=42)
    val_idx, test_idx = train_test_split(temp_idx, test_size=0.5, stratify=labels[temp_idx], random_state=42)
    train_df = df.iloc[train_idx]

    # 1. Frequency lookup tables — real dict, column -> {value: count},
    # built from TRAINING rows only (same leak-free discipline as before)
    print("\nBuilding frequency lookup tables (from TRAINING rows only)...")
    frequency_tables = {}
    for col in FREQ_ENCODE_COLS:
        if col not in df.columns:
            continue
        counts = train_df[col].value_counts()
        frequency_tables[col] = counts.to_dict()
        print(f"  {col}: {len(counts)} known values")

    # 2. Categorical label-encoder mappings — real dict, column ->
    # {category_string: encoded_int}. Fit on the FULL dataset (not
    # train-only) to exactly match build_ieee_cis_graph_data.py, which
    # fits LabelEncoder on all rows — confirmed by direct comparison
    # against the actual trained model (id_31/id_33, the two highest-
    # cardinality columns, showed a real encoding mismatch when this was
    # fit train-only instead).
    print("\nBuilding categorical encoder mappings (matching graph builder's full-dataset fit)...")
    categorical_mappings = {}
    for col in CATEGORICAL_COLS:
        if col not in df.columns:
            continue
        full_col = df[col].fillna("__missing__").astype(str)
        encoder = LabelEncoder()
        encoder.fit(full_col)
        categorical_mappings[col] = {
            cls: int(code) for cls, code in zip(encoder.classes_, encoder.transform(encoder.classes_))
        }
        print(f"  {col}: {len(categorical_mappings[col])} known categories")

    # 3. Canonical feature schema — exact column order + a sensible
    # default for any field the user doesn't provide, matching the
    # training-time fill strategy (0 for missing numerics, -1 for
    # missing M1-M9 booleans) exactly, per column type
    feature_cols = [c for c in df.columns if c not in DROP_COLS and c != "split"]
    defaults = {}
    for col in feature_cols:
        if col in M_COLS:
            defaults[col] = -1
        else:
            defaults[col] = 0
    freq_feature_names = [f"{c}_freq" for c in FREQ_ENCODE_COLS if c in frequency_tables]
    degree_feature_names = ["device_shared_degree", "card_shared_degree"]

    full_feature_order = feature_cols + freq_feature_names + degree_feature_names
    print(f"\nCanonical feature schema: {len(full_feature_order)} total features")

    # 4. Real neighbor-lookup index — card1/deviceinfo value -> list of
    # existing transaction indices that share it. This is what lets a
    # genuinely NEW transaction find its real neighbors (Stage 2), the
    # same way real edges were built for the graph in the first place.
    # Row POSITION here is the actual graph node index — valid because
    # this script uses the exact same "ORDER BY transactionid" query as
    # build_ieee_cis_graph_data.py, guaranteeing identical row order.
    # Built from ALL rows (not train-only) — a new transaction should be
    # able to match against any real existing transaction, matching how
    # the full graph structure was actually available during training.
    print("\nBuilding real neighbor-lookup index (card1/deviceinfo -> existing transaction indices)...")
    card1_to_indices = {k: v.tolist() for k, v in df.groupby("card1").groups.items() if pd.notna(k)}
    deviceinfo_to_indices = {k: v.tolist() for k, v in df.groupby("deviceinfo").groups.items() if pd.notna(k)}
    print(f"  card1: {len(card1_to_indices)} distinct values indexed")
    print(f"  deviceinfo: {len(deviceinfo_to_indices)} distinct values indexed")

    artifacts = {
        "frequency_tables": frequency_tables,
        "categorical_mappings": categorical_mappings,
        "raw_feature_cols": feature_cols,
        "freq_feature_names": freq_feature_names,
        "degree_feature_names": degree_feature_names,
        "full_feature_order": full_feature_order,
        "defaults": defaults,
        "categorical_cols": CATEGORICAL_COLS,
        "m_cols": M_COLS,
        "freq_encode_cols": FREQ_ENCODE_COLS,
        "card1_to_indices": card1_to_indices,
        "deviceinfo_to_indices": deviceinfo_to_indices,
    }

    with open(OUTPUT_PATH, "wb") as f:
        pickle.dump(artifacts, f)
    print(f"\nSaved preprocessing artifacts to {OUTPUT_PATH}")

    # also save a small human-readable summary for sanity-checking
    summary_path = OUTPUT_PATH.replace(".pkl", "_summary.json")
    with open(summary_path, "w") as f:
        json.dump(
            {
                "total_features": len(full_feature_order),
                "frequency_columns": list(frequency_tables.keys()),
                "categorical_columns": list(categorical_mappings.keys()),
            },
            f, indent=2,
        )
    print(f"Saved human-readable summary to {summary_path}")


if __name__ == "__main__":
    main()