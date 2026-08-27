"""Load DGraph-Fin (+ Fin2 node-timestamp extension) into Postgres bronze schema.

Source arrays (see data/raw_downloads/dgraph_fin/Readme.md):
  dgraphfin.npz:
    x               (3,700,550 x 17)  node features
    y               (3,700,550,)      node label: 0=normal,1=fraud,2/3=background
    edge_index      (4,300,999 x 2)   (src_node_id, dst_node_id)
    edge_type       (4,300,999,)      11 edge types
    edge_timestamp  (4,300,999,)      desensitized edge timestamp (original)
    train_mask / valid_mask / test_mask -> indices into class 0/1 nodes only

  dgraphfinv2_node_timestamp.npy (3,700,550,)
    per-node timestamp; sentinel int32 min (-2147483648) = no timestamp
    (background nodes never had a labeled status change)

  dgraphfinv2_edge_timestamp.npy (4,300,999,)
    Fin2's own edge timestamp array, kept alongside the original edge_timestamp
    for comparison during the Silver step rather than assuming they're identical.

Bronze = raw, as-is. No cleaning of the sentinel values here — that's a Silver
step. Two tables: bronze.raw_dgraph_fin_nodes, bronze.raw_dgraph_fin_edges.
"""
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import text

from etl.db.connection import get_engine
from etl.load.bulk_utils import psql_insert_copy

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw_downloads" / "dgraph_fin"
CHUNKSIZE = 200_000


def build_nodes_df(data, node_timestamp):
    n_nodes = data["x"].shape[0]

    df = pd.DataFrame(data["x"], columns=[f"x{i}" for i in range(data["x"].shape[1])])
    df.insert(0, "node_id", np.arange(n_nodes))
    df["y"] = data["y"]
    df["node_timestamp"] = node_timestamp

    # split is only defined for class 0/1 nodes (the ones in train/valid/test masks);
    # everything else (background nodes) gets 'background'.
    split = np.full(n_nodes, "background", dtype=object)
    split[data["train_mask"]] = "train"
    split[data["valid_mask"]] = "valid"
    split[data["test_mask"]] = "test"
    df["split"] = split

    return df


def build_edges_df(data, edge_timestamp_v2):
    edge_index = data["edge_index"]
    df = pd.DataFrame(
        {
            "edge_id": np.arange(edge_index.shape[0]),
            "src_node_id": edge_index[:, 0],
            "dst_node_id": edge_index[:, 1],
            "edge_type": data["edge_type"],
            "edge_timestamp": data["edge_timestamp"],
            "edge_timestamp_v2": edge_timestamp_v2,
        }
    )
    return df


def load_df_to_bronze(df: pd.DataFrame, table_name: str, engine):
    print(f"Loading -> bronze.{table_name} ({len(df):,} rows) ...")
    total = 0
    for start in range(0, len(df), CHUNKSIZE):
        chunk = df.iloc[start:start + CHUNKSIZE]
        chunk.to_sql(
            table_name,
            engine,
            schema="bronze",
            if_exists="replace" if start == 0 else "append",
            index=False,
            method=psql_insert_copy,
        )
        total += len(chunk)
        print(f"  ...{total:,} rows loaded")
    print(f"Done: bronze.{table_name} — {total:,} rows total\n")


def main():
    engine = get_engine()
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS bronze"))
        conn.commit()

    print("Loading npz/npy arrays into memory (this file is large, be patient)...")
    data = np.load(RAW_DIR / "dgraphfin.npz")
    node_timestamp = np.load(RAW_DIR / "dgraphfinv2_node_timestamp.npy")
    edge_timestamp_v2 = np.load(RAW_DIR / "dgraphfinv2_edge_timestamp.npy")

    nodes_df = build_nodes_df(data, node_timestamp)
    load_df_to_bronze(nodes_df, "raw_dgraph_fin_nodes", engine)
    del nodes_df

    edges_df = build_edges_df(data, edge_timestamp_v2)
    load_df_to_bronze(edges_df, "raw_dgraph_fin_edges", engine)


if __name__ == "__main__":
    main()