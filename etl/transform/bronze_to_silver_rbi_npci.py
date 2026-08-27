"""Bronze -> Silver transform for RBI/NPCI context tables.

Three small tables, mostly cleanup:
  - raw_money_rates_2000_2018: split the "X.XX-Y.YY" lending-rate range into
    proper min/max numeric columns; standardize the fiscal-year column name.
  - raw_digital_payment_transactions (quarterly, 2022): light cleanup only.
  - raw_digital_payment_volume_monthly: drop the "Total" summary row (it's a
    derived aggregate, not a real data point — keeping it in would silently
    corrupt any AVG/SUM done later) and clean column names.
"""
from sqlalchemy import text

from etl.db.connection import get_engine


def main():
    engine = get_engine()

    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS silver"))
        conn.commit()

    # --- Money Rates (2000-2018) ---
    print("Transforming money_rates_2000_2018...")
    money_rates_sql = """
    DROP TABLE IF EXISTS silver.rbi_money_rates;
    CREATE TABLE silver.rbi_money_rates AS
    SELECT
        "end_-_march" AS fiscal_year,
        "reserve_bank_-_bank_rate" AS bank_rate,
        "lending_rates_-_sbi" AS sbi_lending_rate,
        SPLIT_PART("lending_rates_-_five_major_banks", '-', 1)::float AS five_major_banks_rate_min,
        SPLIT_PART("lending_rates_-_five_major_banks", '-', 2)::float AS five_major_banks_rate_max,
        "call/notice_-_money_rates" AS call_money_rate
    FROM bronze.raw_money_rates_2000_2018;
    """
    with engine.connect() as conn:
        conn.execute(text(money_rates_sql))
        conn.commit()

    # --- Digital Payment Transactions (quarterly, 2022) ---
    print("Transforming digital_payment_transactions...")
    dpt_sql = """
    DROP TABLE IF EXISTS silver.npci_digital_payments_quarterly;
    CREATE TABLE silver.npci_digital_payments_quarterly AS
    SELECT * FROM bronze.raw_digital_payment_transactions;
    """
    with engine.connect() as conn:
        conn.execute(text(dpt_sql))
        conn.commit()

    # --- Digital Payment Volume (monthly) ---
    print("Transforming digital_payment_volume_monthly...")
    dpv_sql = """
    DROP TABLE IF EXISTS silver.npci_digital_payments_monthly;
    CREATE TABLE silver.npci_digital_payments_monthly AS
    SELECT * FROM bronze.raw_digital_payment_volume_monthly
    WHERE month <> 'Total';
    """
    with engine.connect() as conn:
        conn.execute(text(dpv_sql))
        conn.commit()

    # --- Summary ---
    with engine.connect() as conn:
        for table in [
            "rbi_money_rates",
            "npci_digital_payments_quarterly",
            "npci_digital_payments_monthly",
        ]:
            count = conn.execute(text(f"SELECT COUNT(*) FROM silver.{table}")).scalar()
            print(f"  silver.{table} — {count:,} rows")


if __name__ == "__main__":
    main()