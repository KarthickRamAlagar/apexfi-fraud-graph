"""Silver -> Gold transform for IEEE-CIS.

Adds derived features on top of the cleaned Silver table:
  - day_of_week, hour_of_day, is_weekend: from transaction_date (useful —
    fraud often clusters at unusual times)
  - fiscal_year: India's fiscal year (Apr-Mar), used to join RBI context
  - RBI Money Rates joined in by fiscal_year (bank_rate, sbi_lending_rate,
    call_money_rate) — temporally meaningful since RBI data covers 2000-18
    and IEEE-CIS's anchored dates fall within that range.
  - NOTE: NPCI digital-payment tables (quarterly/monthly, both from 2022)
    are NOT joined here — IEEE-CIS's transaction period predates them, so
    joining would misleadingly imply same-era context. They stay as
    standalone Gold tables instead (see gold.npci_digital_payments_*).

All 394+41 original Silver columns (V1-V339, C1-C14, D1-D15, M1-M9, card/
identity fields, etc.) pass through unchanged — this is additive, not a
narrowing.
"""
from sqlalchemy import text

from etl.db.connection import get_engine


def main():
    engine = get_engine()

    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS gold"))
        conn.commit()

    # First, check the actual transaction_date range so we know what we're
    # working with before assuming the RBI join is meaningful.
    with engine.connect() as conn:
        date_range = conn.execute(
            text("SELECT MIN(transaction_date), MAX(transaction_date) FROM silver.ieee_cis_transactions")
        ).fetchone()
    print(f"Transaction date range: {date_range[0]} to {date_range[1]}")

    sql = """
    DROP TABLE IF EXISTS gold.ieee_cis_features;
    CREATE TABLE gold.ieee_cis_features AS
    SELECT
        s.*,
        EXTRACT(DOW FROM s.transaction_date)::int AS day_of_week,
        EXTRACT(HOUR FROM (s.transaction_date + (s.transactiondt % 86400) * INTERVAL '1 second'))::int AS hour_of_day,
        (EXTRACT(DOW FROM s.transaction_date) IN (0, 6)) AS is_weekend,
        -- India fiscal year runs April-March: if month >= 4, FY starts this
        -- calendar year; otherwise it started the previous calendar year.
        CASE
            WHEN EXTRACT(MONTH FROM s.transaction_date) >= 4
                THEN EXTRACT(YEAR FROM s.transaction_date)::text || '-' || RIGHT((EXTRACT(YEAR FROM s.transaction_date) + 1)::text, 2)
            ELSE (EXTRACT(YEAR FROM s.transaction_date) - 1)::text || '-' || RIGHT(EXTRACT(YEAR FROM s.transaction_date)::text, 2)
        END AS fiscal_year,
        r.bank_rate,
        r.sbi_lending_rate,
        r.call_money_rate
    FROM silver.ieee_cis_transactions s
    LEFT JOIN silver.rbi_money_rates r
        ON r.fiscal_year = CASE
            WHEN EXTRACT(MONTH FROM s.transaction_date) >= 4
                THEN EXTRACT(YEAR FROM s.transaction_date)::text || '-' || RIGHT((EXTRACT(YEAR FROM s.transaction_date) + 1)::text, 2)
            ELSE (EXTRACT(YEAR FROM s.transaction_date) - 1)::text || '-' || RIGHT(EXTRACT(YEAR FROM s.transaction_date)::text, 2)
        END;
    """

    print("Running Silver -> Gold transform for IEEE-CIS...")
    with engine.connect() as conn:
        conn.execute(text(sql))
        conn.commit()

    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM gold.ieee_cis_features")).scalar()
        rbi_matched = conn.execute(
            text("SELECT COUNT(*) FROM gold.ieee_cis_features WHERE bank_rate IS NOT NULL")
        ).scalar()

    print(f"Done: gold.ieee_cis_features — {count:,} rows")
    print(f"  RBI context matched: {rbi_matched:,} / {count:,} ({rbi_matched/count*100:.1f}%)")


if __name__ == "__main__":
    main()