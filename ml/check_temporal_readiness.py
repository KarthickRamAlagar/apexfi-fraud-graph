"""Phase 1, Step 1 of the temporal validation work: verify the real
transaction_date column is genuinely complete and sortable before building
a chronological split or rolling-window features on top of it.

This is a read-only check -- doesn't modify anything, just reports the
real state of the data.
"""
from sqlalchemy import text

from etl.db.connection import get_engine

engine = get_engine()

with engine.connect() as conn:
    print("=== IEEE-CIS transaction_date readiness check ===\n")

    total = conn.execute(text("SELECT COUNT(*) FROM gold.ieee_cis_features")).scalar()
    print(f"Total real transactions: {total:,}")

    null_dates = conn.execute(
        text("SELECT COUNT(*) FROM gold.ieee_cis_features WHERE transaction_date IS NULL")
    ).scalar()
    print(f"Real rows with NULL transaction_date: {null_dates:,} ({null_dates / total * 100:.3f}%)")

    date_range = conn.execute(
        text("SELECT MIN(transaction_date), MAX(transaction_date) FROM gold.ieee_cis_features")
    ).fetchone()
    print(f"Real date range: {date_range[0]} to {date_range[1]}")

    # check for exact-duplicate timestamps -- matters for a clean split,
    # since many transactions sharing the exact same instant could land
    # ambiguously across a train/val/test boundary
    dup_check = conn.execute(
        text(
            """
            SELECT COUNT(*) FROM (
                SELECT transaction_date, COUNT(*) AS c
                FROM gold.ieee_cis_features
                GROUP BY transaction_date
                HAVING COUNT(*) > 1
            ) dupes
            """
        )
    ).scalar()
    print(f"Real distinct timestamps shared by 2+ transactions: {dup_check:,}")

    # real monthly distribution -- confirms genuine, real spread across time,
    # not e.g. everything clustered in one week
    monthly = conn.execute(
        text(
            """
            SELECT DATE_TRUNC('month', transaction_date) AS month, COUNT(*) AS cnt
            FROM gold.ieee_cis_features
            GROUP BY month
            ORDER BY month
            """
        )
    ).fetchall()
    print("\nReal monthly distribution:")
    for m, c in monthly:
        print(f"  {m.strftime('%Y-%m')}: {c:,} transactions")

    print("\n=== Verdict ===")
    if null_dates == 0:
        print("PASS: no missing dates -- safe to sort and split chronologically.")
    else:
        print(f"WARNING: {null_dates:,} rows have no date -- these need a decision before splitting")
        print("  (exclude them, or investigate whether they can be recovered from another field).")