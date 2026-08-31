"""One-off script: export DGraph-Fin's real Gold-layer data (nodes + edges)
to clean CSV files, ready to upload as a Kaggle Dataset.

Exporting from our own already-processed Gold layer (rather than
redistributing the original raw file) keeps this clean and avoids any
uncertainty about the original source's redistribution terms — this is
our own real, legitimately-processed data.
"""
from sqlalchemy import text
import pandas as pd
from etl.db.connection import get_engine

engine = get_engine()

print("Exporting nodes and edges from the real Gold layer...")
with engine.connect() as conn:
    nodes = pd.read_sql("SELECT * FROM gold.dgraph_fin_nodes", conn)
    edges = pd.read_sql("SELECT * FROM gold.dgraph_fin_edges", conn)

nodes.to_csv("dgraph_fin_nodes.csv", index=False)
edges.to_csv("dgraph_fin_edges.csv", index=False)

print(f"nodes: {len(nodes):,} rows -> dgraph_fin_nodes.csv")
print(f"edges: {len(edges):,} rows -> dgraph_fin_edges.csv")
print("\nReady to upload as a Kaggle Dataset.")