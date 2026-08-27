"""Silver -> Gold transform for DGraph-Fin.

Nodes: adds degree features computed from the edge list — in_degree,
out_degree, total_degree. These are genuinely useful graph-structural
features (unusual connectivity often correlates with fraud rings) and cost
nothing extra to compute since we already have the edge list.

Edges: gold.dgraph_fin_edges keeps only the canonical edge_timestamp
(the original, more granular field — see the Silver-layer finding that
edge_timestamp_v2 is a rebased, information-losing derivative of it).
The diagnostic timestamps_match / edge_timestamp_v2 columns are dropped
here since their job (verifying the relationship) is done; they remain
available in silver.dgraph_fin_edges if ever needed again.
"""
from sqlalchemy import text

from etl.db.connection import get_engine


def main():
    engine = get_engine()

    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS gold"))
        conn.commit()

    # --- Edges (simpler, do first) ---
    print("Building gold.dgraph_fin_edges...")
    edges_sql = """
    DROP TABLE IF EXISTS gold.dgraph_fin_edges;
    CREATE TABLE gold.dgraph_fin_edges AS
    SELECT edge_id, src_node_id, dst_node_id, edge_type, edge_timestamp
    FROM silver.dgraph_fin_edges;
    """
    with engine.connect() as conn:
        conn.execute(text(edges_sql))
        conn.commit()

    # --- Nodes with degree features ---
    print("Building gold.dgraph_fin_nodes (computing degrees, this may take a moment)...")
    nodes_sql = """
    DROP TABLE IF EXISTS gold.dgraph_fin_nodes;
    CREATE TABLE gold.dgraph_fin_nodes AS
    WITH out_deg AS (
        SELECT src_node_id AS node_id, COUNT(*) AS out_degree
        FROM silver.dgraph_fin_edges
        GROUP BY src_node_id
    ),
    in_deg AS (
        SELECT dst_node_id AS node_id, COUNT(*) AS in_degree
        FROM silver.dgraph_fin_edges
        GROUP BY dst_node_id
    )
    SELECT
        n.node_id,
        n.x0, n.x1, n.x2, n.x3, n.x4, n.x5, n.x6, n.x7, n.x8, n.x9,
        n.x10, n.x11, n.x12, n.x13, n.x14, n.x15, n.x16,
        n.label_raw, n.label,
        n.node_timestamp,
        n.split,
        COALESCE(o.out_degree, 0) AS out_degree,
        COALESCE(i.in_degree, 0) AS in_degree,
        COALESCE(o.out_degree, 0) + COALESCE(i.in_degree, 0) AS total_degree
    FROM silver.dgraph_fin_nodes n
    LEFT JOIN out_deg o ON n.node_id = o.node_id
    LEFT JOIN in_deg i ON n.node_id = i.node_id;
    """
    with engine.connect() as conn:
        conn.execute(text(nodes_sql))
        conn.commit()

    with engine.connect() as conn:
        node_count = conn.execute(text("SELECT COUNT(*) FROM gold.dgraph_fin_nodes")).scalar()
        edge_count = conn.execute(text("SELECT COUNT(*) FROM gold.dgraph_fin_edges")).scalar()
        isolated = conn.execute(
            text("SELECT COUNT(*) FROM gold.dgraph_fin_nodes WHERE total_degree = 0")
        ).scalar()
        avg_degree_by_label = conn.execute(
            text("SELECT label, AVG(total_degree) FROM gold.dgraph_fin_nodes GROUP BY label ORDER BY label")
        ).fetchall()

    print(f"\nDone: gold.dgraph_fin_nodes — {node_count:,} rows, gold.dgraph_fin_edges — {edge_count:,} rows")
    print(f"Isolated nodes (degree 0): {isolated:,}")
    print("Average total_degree by label:")
    for label, avg_deg in avg_degree_by_label:
        print(f"  {label}: {avg_deg:.2f}")


if __name__ == "__main__":
    main()