"""Bronze -> Silver transform for DGraph-Fin.

Nodes:
  - node_timestamp sentinel (int32 min, -2147483648) -> proper NULL.
    Background nodes (Class 2/3) never had a labeled status change, so NULL
    is the honest representation — the sentinel was just a placeholder
    pandas/numpy needed, not a real value.
  - y (0/1/2/3) -> a readable label: 'normal', 'fraud', 'background'.
    Classes 2 and 3 are both background/non-target nodes (per the dataset's
    Readme); we collapse them into one 'background' label since neither is
    individually meaningful for the fraud task, while keeping the original
    numeric y column too in case the 2 vs 3 distinction matters later.

Edges:
  - Compare edge_timestamp (original) vs edge_timestamp_v2 (Fin2's own
    array) instead of assuming they're identical — report the match rate
    so we know which one to trust/use going forward.
"""
from sqlalchemy import text

from etl.db.connection import get_engine


def main():
    engine = get_engine()

    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS silver"))
        conn.commit()

    # --- Nodes ---
    print("Transforming nodes...")
    nodes_sql = """
    DROP TABLE IF EXISTS silver.dgraph_fin_nodes;
    CREATE TABLE silver.dgraph_fin_nodes AS
    SELECT
        node_id,
        x0, x1, x2, x3, x4, x5, x6, x7, x8, x9, x10, x11, x12, x13, x14, x15, x16,
        y AS label_raw,
        CASE
            WHEN y = 0 THEN 'normal'
            WHEN y = 1 THEN 'fraud'
            WHEN y IN (2, 3) THEN 'background'
        END AS label,
        CASE WHEN node_timestamp = -2147483648 THEN NULL ELSE node_timestamp END AS node_timestamp,
        split
    FROM bronze.raw_dgraph_fin_nodes;
    """
    with engine.connect() as conn:
        conn.execute(text(nodes_sql))
        conn.commit()

    with engine.connect() as conn:
        node_count = conn.execute(text("SELECT COUNT(*) FROM silver.dgraph_fin_nodes")).scalar()
        label_counts = conn.execute(
            text("SELECT label, COUNT(*) FROM silver.dgraph_fin_nodes GROUP BY label ORDER BY label")
        ).fetchall()
        null_ts_count = conn.execute(
            text("SELECT COUNT(*) FROM silver.dgraph_fin_nodes WHERE node_timestamp IS NULL")
        ).scalar()

    print(f"  silver.dgraph_fin_nodes — {node_count:,} rows")
    for label, cnt in label_counts:
        print(f"    {label}: {cnt:,}")
    print(f"    node_timestamp NULL (background/no-event): {null_ts_count:,}")

    # --- Edges ---
    print("\nTransforming edges...")
    edges_sql = """
    DROP TABLE IF EXISTS silver.dgraph_fin_edges;
    CREATE TABLE silver.dgraph_fin_edges AS
    SELECT
        edge_id,
        src_node_id,
        dst_node_id,
        edge_type,
        edge_timestamp,
        edge_timestamp_v2,
        (edge_timestamp = edge_timestamp_v2) AS timestamps_match
    FROM bronze.raw_dgraph_fin_edges;
    """
    with engine.connect() as conn:
        conn.execute(text(edges_sql))
        conn.commit()

    with engine.connect() as conn:
        edge_count = conn.execute(text("SELECT COUNT(*) FROM silver.dgraph_fin_edges")).scalar()
        match_count = conn.execute(
            text("SELECT COUNT(*) FROM silver.dgraph_fin_edges WHERE timestamps_match")
        ).scalar()

    print(f"  silver.dgraph_fin_edges — {edge_count:,} rows")
    print(f"    edge_timestamp == edge_timestamp_v2: {match_count:,} / {edge_count:,} ({match_count/edge_count*100:.2f}%)")


if __name__ == "__main__":
    main()