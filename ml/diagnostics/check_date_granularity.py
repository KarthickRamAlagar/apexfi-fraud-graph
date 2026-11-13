"""Direct check: does transaction_date actually carry real time-of-day
information, or only calendar dates (always midnight)? This determines
whether an hour-based rolling window is even meaningful on this field."""
from sqlalchemy import text
from etl.db.connection import get_engine

engine = get_engine()
with engine.connect() as conn:
    rows = conn.execute(
        text(
            """
            SELECT transactionid, transaction_date
            FROM gold.ieee_cis_features
            ORDER BY transaction_date
            LIMIT 10
            """
        )
    ).fetchall()
    print("First 10 real transaction_date values, full precision:")
    for r in rows:
        print(f"  {r.transactionid}: {r.transaction_date}")

    distinct_times = conn.execute(
        text("SELECT COUNT(DISTINCT transaction_date::time) FROM gold.ieee_cis_features")
    ).scalar()
    print(f"\nReal distinct TIME-of-day values across all rows: {distinct_times}")
    print("(if this is 1, every row is midnight -- no real sub-day granularity exists)")

    # also check if there's a raw seconds-based column that DOES have
    # real granularity, e.g. the original TransactionDT
    cols = conn.execute(
        text(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema='gold' AND table_name='ieee_cis_features'
              AND column_name ILIKE '%dt%' OR column_name ILIKE '%time%' OR column_name ILIKE '%second%'
            """
        )
    ).fetchall()
    print("\nReal columns that might hold finer-grained timing info:")
    for c in cols:
        print(f"  {c.column_name}")