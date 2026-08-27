"""Silver -> Gold transform for RBI/NPCI context tables.

These are already clean at Silver (small, well-typed tables), so Gold is
mostly a direct promotion plus a numeric year field for easier filtering
in the Analytics dashboard page later.
"""
from sqlalchemy import text

from etl.db.connection import get_engine


def main():
    engine = get_engine()

    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS gold"))
        conn.commit()

    # --- RBI Money Rates: add a numeric starting-year column for easier sorting/filtering ---
    print("Building gold.rbi_money_rates...")
    money_rates_sql = """
    DROP TABLE IF EXISTS gold.rbi_money_rates;
    CREATE TABLE gold.rbi_money_rates AS
    SELECT
        fiscal_year,
        SPLIT_PART(fiscal_year, '-', 1)::int AS fiscal_year_start,
        bank_rate,
        sbi_lending_rate,
        five_major_banks_rate_min,
        five_major_banks_rate_max,
        call_money_rate
    FROM silver.rbi_money_rates
    ORDER BY fiscal_year_start;
    """
    with engine.connect() as conn:
        conn.execute(text(money_rates_sql))
        conn.commit()

    # --- NPCI Digital Payments (quarterly, 2022) ---
    print("Building gold.npci_digital_payments_quarterly...")
    dpq_sql = """
    DROP TABLE IF EXISTS gold.npci_digital_payments_quarterly;
    CREATE TABLE gold.npci_digital_payments_quarterly AS
    SELECT * FROM silver.npci_digital_payments_quarterly;
    """
    with engine.connect() as conn:
        conn.execute(text(dpq_sql))
        conn.commit()

    # --- NPCI Digital Payments (monthly) ---
    print("Building gold.npci_digital_payments_monthly...")
    dpm_sql = """
    DROP TABLE IF EXISTS gold.npci_digital_payments_monthly;
    CREATE TABLE gold.npci_digital_payments_monthly AS
    SELECT * FROM silver.npci_digital_payments_monthly;
    """
    with engine.connect() as conn:
        conn.execute(text(dpm_sql))
        conn.commit()

    with engine.connect() as conn:
        for table in ["rbi_money_rates", "npci_digital_payments_quarterly", "npci_digital_payments_monthly"]:
            count = conn.execute(text(f"SELECT COUNT(*) FROM gold.{table}")).scalar()
            print(f"  gold.{table} — {count:,} rows")


if __name__ == "__main__":
    main()