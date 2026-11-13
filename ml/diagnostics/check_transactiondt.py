"""Properly-scoped check (the last query had a real bug -- an unparenthesized
OR caused it to search the whole database, not just this table): does
gold.ieee_cis_features actually have transactiondt, the original raw,
second-level time-delta field, and does it have real, genuine sub-day
granularity we can use instead of the day-only transaction_date?
"""
from sqlalchemy import text
from etl.db.connection import get_engine

engine = get_engine()
with engine.connect() as conn:
    cols = conn.execute(
        text(
            """
            SELECT column_name, data_type FROM information_schema.columns
            WHERE table_schema = 'gold' AND table_name = 'ieee_cis_features'
              AND (column_name ILIKE '%dt%' OR column_name ILIKE '%time%')
            """
        )
    ).fetchall()
    print("Real timing-related columns actually in gold.ieee_cis_features:")
    for c in cols:
        print(f"  {c.column_name} ({c.data_type})")

    has_dt = any(c.column_name == "transactiondt" for c in cols)
    if has_dt:
        stats = conn.execute(
            text("SELECT MIN(transactiondt), MAX(transactiondt), COUNT(DISTINCT transactiondt) FROM gold.ieee_cis_features")
        ).fetchone()
        print(f"\nReal transactiondt range: {stats[0]} to {stats[1]}")
        print(f"Real distinct values: {stats[2]:,} (out of 590,540 total rows)")
        print("\nIf distinct values is close to 590,540, this genuinely has real,")
        print("fine-grained (second-level) precision -- unlike transaction_date.")
    else:
        print("\ntransactiondt not found directly in gold.ieee_cis_features.")