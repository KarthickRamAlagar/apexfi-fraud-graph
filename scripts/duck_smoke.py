"""Check the DuckDB/Parquet backend on the REAL exported files: does each query used by the app
work, and how long does it take?  (Reads only.)

    uv run python -m scripts.duck_smoke
"""
import os
import time

os.environ["DATA_BACKEND"] = "duckdb"

from sqlalchemy import text  # noqa: E402

from etl.db.connection import get_engine  # noqa: E402


def timed(conn, label, sql, params=None):
    t0 = time.perf_counter()
    rows = conn.execute(text(sql), params or {}).fetchall()
    ms = (time.perf_counter() - t0) * 1000
    print(f"{label:34s} {ms:9.1f} ms   {len(rows)} row(s)  {str(rows[0])[:70] if rows else ''}")
    return rows


def main():
    e = get_engine()
    with e.connect() as c:
        print("first run of each query (cold), then a second run (warm):\n")
        n = c.execute(text("SELECT COUNT(*) FROM gold.ieee_cis_features")).scalar()
        tid = timed(c, "pick a transaction", f"SELECT transactionid FROM gold.ieee_cis_features ORDER BY transactionid LIMIT 1 OFFSET {n // 2}")[0][0]
        card = timed(c, "pick a card", "SELECT card1, deviceinfo, transactiondt FROM gold.ieee_cis_features WHERE transactionid=:i", {"i": tid})[0]
        for rnd in (1, 2):
            print(f"--- run {rnd} ---")
            timed(c, "dashboard summary", "SELECT payload FROM gold.precomputed_summary WHERE dataset_key='dashboard'")
            timed(c, "recent transactions", "SELECT transactionid, transactionamt FROM gold.ieee_cis_features ORDER BY transaction_date DESC LIMIT 8")
            timed(c, "investigate: one transaction", "SELECT * FROM gold.ieee_cis_features WHERE transactionid=:i", {"i": tid})
            timed(c, "investigate: search prefix", "SELECT transactionid FROM gold.ieee_cis_features WHERE transactionid::text LIKE :p ORDER BY transactionid LIMIT 8", {"p": str(tid)[:5] + "%"})
            timed(c, "investigate: neighbours", "SELECT CASE WHEN src_transactionid=:i THEN dst_transactionid ELSE src_transactionid END AS n, edge_type FROM gold.ieee_cis_transaction_edges WHERE src_transactionid=:i OR dst_transactionid=:i LIMIT 12", {"i": tid})
            timed(c, "investigate: edge counts", "SELECT edge_type, COUNT(*) FROM gold.ieee_cis_transaction_edges WHERE src_transactionid=:i OR dst_transactionid=:i GROUP BY edge_type", {"i": tid})
            timed(c, "temporal: rolling card stats", "SELECT COUNT(*), COALESCE(SUM(transactionamt),0) FROM gold.ieee_cis_features WHERE card1=:c AND transactiondt < :t AND transactiondt >= :t-3600", {"c": card[0], "t": card[2]})
            timed(c, "temporal: split point", "SELECT percentile_disc(0.75) WITHIN GROUP (ORDER BY transactiondt) FROM gold.ieee_cis_features")
            timed(c, "dgraph: search", "SELECT node_id, total_degree, label FROM gold.dgraph_fin_nodes WHERE node_id::text LIKE :p ORDER BY node_id LIMIT 8", {"p": "12%"})
            timed(c, "dgraph: random samples", "SELECT node_id FROM gold.dgraph_fin_nodes WHERE label NOT IN ('fraud','normal') ORDER BY random() LIMIT 8")
            timed(c, "ask-style: fraud rate", "SELECT AVG(is_fraud::int) FROM gold.ieee_cis_features")
            timed(c, "ask-style: group by", "SELECT productcd, COUNT(*), AVG(transactionamt) FROM gold.ieee_cis_features GROUP BY productcd")
    print("\nIf every line shows a row count and a time, the Parquet backend is ready.")


if __name__ == "__main__":
    main()
