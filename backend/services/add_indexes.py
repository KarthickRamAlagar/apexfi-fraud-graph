"""One-time index creation for fast per-transaction lookups on the
Investigate page. Without these, every lookup does a full scan of
gold.ieee_cis_transaction_edges (17.3M rows) — the root cause of the
multi-minute Investigate page load times.

Run once. Safe to re-run (IF NOT EXISTS).
"""
from sqlalchemy import text

from etl.db.connection import get_engine

engine = get_engine()

INDEXES = [
    ("idx_ieee_edges_src", "gold.ieee_cis_transaction_edges", "src_transactionid"),
    ("idx_ieee_edges_dst", "gold.ieee_cis_transaction_edges", "dst_transactionid"),
    ("idx_ieee_edges_type", "gold.ieee_cis_transaction_edges", "edge_type"),
    ("idx_ieee_features_txnid", "gold.ieee_cis_features", "transactionid"),
]


def main():
    with engine.connect() as conn:
        for index_name, table, column in INDEXES:
            print(f"Creating index {index_name} on {table}({column})...")
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} ({column})"))
            conn.commit()
            print("  done")
    print("\nAll indexes created. Investigate page lookups should now be near-instant.")


if __name__ == "__main__":
    main()
