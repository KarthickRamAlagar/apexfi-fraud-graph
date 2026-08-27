"""Exports a snapshot of the Gold layer to Parquet files for the Streamlit
deep-EDA app (streamlit_app/). Both local and deployed Streamlit read from
these files — not a live Postgres connection — since the data doesn't
actually change minute-to-minute (only when ETL/precompute is re-run), and
Streamlit Community Cloud can't reach a local database anyway.

Re-run this whenever you want to refresh the snapshot (after new ETL runs,
or before redeploying).

Scope note: full mean/std/min/max/missing% is computed for EVERY column
(cheap — one pass per table). Percentile distributions (P25/P50/P75) stay
scoped to the same curated columns as the React EDA page — computing exact
percentiles for 358+ columns individually would need a separate sort per
column and get expensive fast.

Raw-row browsing uses a representative SAMPLE (50,000 rows), not the full
590K/3.7M rows — keeps Parquet files well under GitHub's 100MB file limit
and keeps the deployed app fast. The aggregate stats above are computed
from the FULL real data regardless, so headline numbers stay accurate even
though the raw browser shows a sample.
"""
import os
import json

import pandas as pd
from sqlalchemy import text

from etl.db.connection import get_engine

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "streamlit_app", "data")
SAMPLE_SIZE = 50_000

# For raw-row browsing, only meaningful/interpretable columns — the 339
# anonymized V-columns aren't meaningfully browsable as raw values anyway
# (their aggregate distributions are still fully covered in the full-column
# stats export above). Including all 440 raw columns in a 50K-row sample
# is ~1.4GB in memory once loaded — likely what was exceeding Streamlit
# Community Cloud's free-tier memory ceiling.
IEEE_SAMPLE_COLUMNS = [
    "transactionid", "is_fraud", "transactionamt", "productcd",
    "card1", "card2", "card3", "card4", "card5", "card6",
    "addr1", "addr2", "dist1", "dist2", "p_emaildomain", "r_emaildomain",
    "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10", "c11", "c12", "c13", "c14",
    "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9", "d10", "d11", "d12", "d13", "d14", "d15",
    "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9",
    "devicetype", "deviceinfo",
    "day_of_week", "hour_of_day", "fiscal_year", "bank_rate", "sbi_lending_rate", "call_money_rate",
    "transaction_date",
]

engine = get_engine()


def get_all_columns(table, conn):
    rows = conn.execute(
        text(
            """
            SELECT column_name, data_type FROM information_schema.columns
            WHERE table_schema = 'gold' AND table_name = :t
            ORDER BY ordinal_position
            """
        ),
        {"t": table},
    ).fetchall()
    return [(r.column_name, r.data_type) for r in rows]


NUMERIC_TYPES = {"integer", "bigint", "double precision", "numeric", "real", "smallint"}


BATCH_SIZE = 40  # keeps each query's expression count safely under Postgres's 1664-column limit


def compute_full_column_stats(table, conn):
    """Mean/std/min/max/count for every column, batched into multiple
    queries — a single query covering all 440 IEEE-CIS columns exceeds
    Postgres's hard 1664-expression-per-SELECT limit."""
    columns = get_all_columns(table, conn)
    row_count = conn.execute(text(f"SELECT COUNT(*) FROM gold.{table}")).scalar()

    numeric_cols = [c for c, t in columns if t in NUMERIC_TYPES]
    numeric_set = set(numeric_cols)
    all_col_names = [c for c, _ in columns]

    non_null_counts = {}
    for i in range(0, len(all_col_names), BATCH_SIZE):
        batch = all_col_names[i : i + BATCH_SIZE]
        exprs = [f"COUNT({c}) AS c{j}" for j, c in enumerate(batch)]
        row = dict(conn.execute(text(f"SELECT {', '.join(exprs)} FROM gold.{table}")).fetchone()._mapping)
        for j, c in enumerate(batch):
            non_null_counts[c] = row[f"c{j}"]

    numeric_stats = {}
    for i in range(0, len(numeric_cols), BATCH_SIZE):
        batch = numeric_cols[i : i + BATCH_SIZE]
        exprs = []
        for j, c in enumerate(batch):
            exprs += [
                f"AVG({c})::float AS mean{j}",
                f"STDDEV({c})::float AS std{j}",
                f"MIN({c})::float AS min{j}",
                f"MAX({c})::float AS max{j}",
            ]
        row = dict(conn.execute(text(f"SELECT {', '.join(exprs)} FROM gold.{table}")).fetchone()._mapping)
        for j, c in enumerate(batch):
            numeric_stats[c] = {
                "mean": row[f"mean{j}"], "std": row[f"std{j}"], "min": row[f"min{j}"], "max": row[f"max{j}"]
            }

    records = []
    for col, dtype in columns:
        rec = {
            "column": col,
            "dtype": dtype,
            "non_null_count": non_null_counts[col],
            "missing_pct": round((1 - non_null_counts[col] / row_count) * 100, 2) if row_count else 0.0,
            "is_numeric": col in numeric_set,
        }
        if col in numeric_stats:
            rec.update(numeric_stats[col])
        records.append(rec)

    return pd.DataFrame(records), row_count


def export_sample(table, conn, sample_size, columns=None):
    total = conn.execute(text(f"SELECT COUNT(*) FROM gold.{table}")).scalar()
    col_list = ", ".join(columns) if columns else "*"
    if total <= sample_size:
        query = f"SELECT {col_list} FROM gold.{table}"
    else:
        # TABLESAMPLE is fast (block-level sampling), fine for a
        # representative snapshot — doesn't need to be a perfect random sample
        pct = min(100.0, sample_size / total * 100 * 1.2)  # slight oversample, then trim
        query = f"SELECT {col_list} FROM gold.{table} TABLESAMPLE BERNOULLI({pct}) LIMIT {sample_size}"
    return pd.read_sql(text(query), conn)


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with engine.connect() as conn:
        for table in ["ieee_cis_features", "dgraph_fin_nodes"]:
            print(f"Computing full-column stats for {table}...")
            stats_df, row_count = compute_full_column_stats(table, conn)
            stats_df.to_parquet(os.path.join(OUTPUT_DIR, f"{table}_column_stats.parquet"))
            print(f"  {len(stats_df)} columns profiled from {row_count:,} real rows")

            print(f"Exporting {SAMPLE_SIZE:,}-row sample of {table}...")
            cols = IEEE_SAMPLE_COLUMNS if table == "ieee_cis_features" else None
            sample_df = export_sample(table, conn, SAMPLE_SIZE, columns=cols)
            sample_df.to_parquet(os.path.join(OUTPUT_DIR, f"{table}_sample.parquet"))
            print(f"  {len(sample_df):,} rows exported ({len(sample_df.columns)} columns)")

        # small tables — export in full, no sampling needed
        for table in [
            "ieee_cis_transaction_edges", "dgraph_fin_edges", "rbi_money_rates",
            "npci_digital_payments_quarterly", "npci_digital_payments_monthly",
        ]:
            print(f"Exporting {table} in full...")
            df = pd.read_sql(text(f"SELECT * FROM gold.{table}"), conn)
            df.to_parquet(os.path.join(OUTPUT_DIR, f"{table}.parquet"))
            print(f"  {len(df):,} rows exported")

        # reuse the precomputed EDA/Analytics summaries too — same JSON
        # already backing the React app, no need to recompute
        summary_rows = conn.execute(
            text("SELECT dataset_key, payload FROM gold.precomputed_summary")
        ).fetchall()
        for r in summary_rows:
            with open(os.path.join(OUTPUT_DIR, f"summary_{r.dataset_key}.json"), "w") as f:
                json.dump(r.payload, f)
        print(f"Exported {len(summary_rows)} precomputed summaries (reused from the React app).")

    total_size = sum(
        os.path.getsize(os.path.join(OUTPUT_DIR, f)) for f in os.listdir(OUTPUT_DIR)
    )
    print(f"\nDone. Total snapshot size: {total_size / 1024 / 1024:.1f} MB in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()