"""Build gold.ieee_cis_transaction_edges — the graph structure for IEEE-CIS.

Two edge types, chosen based on real evidence from EDA
(eda_shared_attribute_analysis.py), not guesswork:

  - device_shared: transactions using the same deviceinfo.
    Lift 2.67 (440 singleton comparison) — the strongest real signal found.
  - card_shared: transactions using the same card1.
    Lift 0.82 on its own (weak), but included for structural reasons —
    standard practice in fraud-graph literature to link same-card
    transactions regardless of univariate lift, since a GNN can extract
    multi-hop patterns from the resulting neighborhood structure that a
    simple lift calculation can't capture.

This is purely additive: does not modify gold.ieee_cis_features in any way
(same 590,540 rows, same columns, same is_fraud target). It only creates a
new, separate edge-list table.

To keep the edge count manageable, only fields with 2+ transactions sharing
a value produce edges (a singleton value has nothing to connect to, by
definition) — and each shared value produces a fully-connected clique among
its transactions (every pair within the group gets an edge). For very large
groups this can create many edges, so we cap group size per edge type to
avoid one giant, uninformative "hub" value dominating the graph.
"""
from sqlalchemy import text

from etl.db.connection import get_engine

MAX_GROUP_SIZE = 500  # skip building edges for values shared by more than this many transactions


def build_edges_for_field(engine, field, edge_type, table_suffix):
    print(f"Building {edge_type} edges from '{field}' (capping groups > {MAX_GROUP_SIZE})...")

    sql = f"""
    DROP TABLE IF EXISTS gold._tmp_edges_{table_suffix};
    CREATE TABLE gold._tmp_edges_{table_suffix} AS
    WITH group_sizes AS (
        SELECT {field}, COUNT(*) AS group_size
        FROM gold.ieee_cis_features
        WHERE {field} IS NOT NULL
        GROUP BY {field}
        HAVING COUNT(*) BETWEEN 2 AND {MAX_GROUP_SIZE}
    ),
    grouped_txns AS (
        SELECT t.transactionid, t.{field}
        FROM gold.ieee_cis_features t
        JOIN group_sizes g ON t.{field} = g.{field}
    )
    SELECT
        a.transactionid AS src_transactionid,
        b.transactionid AS dst_transactionid,
        '{edge_type}' AS edge_type
    FROM grouped_txns a
    JOIN grouped_txns b
        ON a.{field} = b.{field}
        AND a.transactionid < b.transactionid;
    """
    with engine.connect() as conn:
        conn.execute(text(sql))
        conn.commit()

    with engine.connect() as conn:
        count = conn.execute(text(f"SELECT COUNT(*) FROM gold._tmp_edges_{table_suffix}")).scalar()
    print(f"  {count:,} edges built")
    return count


def main():
    engine = get_engine()

    device_count = build_edges_for_field(engine, "deviceinfo", "device_shared", "device")
    card_count = build_edges_for_field(engine, "card1", "card_shared", "card")

    print("\nCombining into gold.ieee_cis_transaction_edges...")
    combine_sql = """
    DROP TABLE IF EXISTS gold.ieee_cis_transaction_edges;
    CREATE TABLE gold.ieee_cis_transaction_edges AS
    SELECT * FROM gold._tmp_edges_device
    UNION ALL
    SELECT * FROM gold._tmp_edges_card;

    DROP TABLE gold._tmp_edges_device;
    DROP TABLE gold._tmp_edges_card;
    """
    with engine.connect() as conn:
        conn.execute(text(combine_sql))
        conn.commit()

    with engine.connect() as conn:
        total = conn.execute(text("SELECT COUNT(*) FROM gold.ieee_cis_transaction_edges")).scalar()
        by_type = conn.execute(
            text("SELECT edge_type, COUNT(*) FROM gold.ieee_cis_transaction_edges GROUP BY edge_type")
        ).fetchall()
        # sanity check: gold.ieee_cis_features must be completely untouched
        feature_count = conn.execute(text("SELECT COUNT(*) FROM gold.ieee_cis_features")).scalar()

    print(f"\nDone: gold.ieee_cis_transaction_edges — {total:,} edges total")
    for edge_type, cnt in by_type:
        print(f"  {edge_type}: {cnt:,}")
    print(f"\nSanity check — gold.ieee_cis_features row count unchanged: {feature_count:,} (should still be 590,540)")


if __name__ == "__main__":
    main()