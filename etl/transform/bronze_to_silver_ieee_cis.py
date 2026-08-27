"""Bronze -> Silver transform for IEEE-CIS.

What this does:
  1. Joins transaction + identity (LEFT JOIN on transactionid — not every
     transaction has device/identity data, and that's real, not an error).
  2. isfraud: bigint 0/1 -> proper boolean.
  3. m1..m9: text 'T'/'F' -> proper boolean (NULL stays NULL).
  4. transaction_date: TransactionDT is "seconds since an arbitrary reference
     point", not a real calendar date. We anchor it to 2017-12-01, the
     reference date widely used in the public IEEE-CIS community analysis
     (Kaggle discussion threads on this competition) since the true anchor
     was never officially published by the organizers. This produces
     plausible, internally-consistent relative dates (correct day-of-week /
     time-of-day / ordering) — treat the specific calendar date as an
     assumption, not a verified fact, in your write-up.
  5. All V1..V339 and C1..C14, D1..D15 columns pass through unchanged — they
     were already typed correctly as floats when pandas loaded them into
     Bronze. Feature engineering on them happens later, in Gold.

Result: silver.ieee_cis_transactions (one row per transaction).
"""
import re
from sqlalchemy import text

from etl.db.connection import get_engine


def get_columns(engine, schema, table, pattern=None, exclude=None):
    exclude = exclude or set()
    query = text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema=:schema AND table_name=:table "
        "ORDER BY ordinal_position"
    )
    with engine.connect() as conn:
        rows = conn.execute(query, {"schema": schema, "table": table}).fetchall()
    cols = [r[0] for r in rows]
    if pattern:
        regex = re.compile(pattern)
        cols = [c for c in cols if regex.fullmatch(c)]
    return [c for c in cols if c not in exclude]


def main():
    engine = get_engine()

    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS silver"))
        conn.commit()

    # V1..V339, C1..C14, D1..D15 pass through as-is (already correctly typed floats)
    # Use exact patterns (letter + digits only) so card1-6 / dist1-2 aren't
    # mistakenly swept up by the C / D prefix.
    v_cols = get_columns(engine, "bronze", "raw_ieee_cis_transaction", pattern=r"v\d+")
    c_cols = get_columns(engine, "bronze", "raw_ieee_cis_transaction", pattern=r"c\d+")
    d_cols = get_columns(engine, "bronze", "raw_ieee_cis_transaction", pattern=r"d\d+")
    m_cols = [f"m{i}" for i in range(1, 10)]

    passthrough_cols = v_cols + c_cols + d_cols
    passthrough_sql = ",\n    ".join(f"t.{c}" for c in passthrough_cols)

    m_sql = ",\n    ".join(
        f"CASE t.{m} WHEN 'T' THEN true WHEN 'F' THEN false ELSE NULL END AS {m}"
        for m in m_cols
    )

    # identity columns, excluding transactionid (already joined on)
    identity_cols = get_columns(
        engine, "bronze", "raw_ieee_cis_identity", exclude={"transactionid"}
    )
    identity_sql = ",\n    ".join(f"idn.{c}" for c in identity_cols)

    sql = f"""
    DROP TABLE IF EXISTS silver.ieee_cis_transactions;
    CREATE TABLE silver.ieee_cis_transactions AS
    SELECT
        t.transactionid,
        (t.isfraud = 1) AS is_fraud,
        t.transactiondt,
        (DATE '2017-12-01' + (t.transactiondt / 86400) * INTERVAL '1 day') AS transaction_date,
        t.transactionamt,
        t.productcd,
        t.card1, t.card2, t.card3, t.card4, t.card5, t.card6,
        t.addr1, t.addr2,
        t.dist1, t.dist2,
        t.p_emaildomain, t.r_emaildomain,
        {passthrough_sql},
        {m_sql},
        {identity_sql}
    FROM bronze.raw_ieee_cis_transaction t
    LEFT JOIN bronze.raw_ieee_cis_identity idn
        ON t.transactionid = idn.transactionid;
    """

    print("Running Bronze -> Silver transform for IEEE-CIS (this may take a moment)...")
    with engine.connect() as conn:
        conn.execute(text(sql))
        conn.commit()

    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM silver.ieee_cis_transactions")).scalar()
        fraud_count = conn.execute(
            text("SELECT COUNT(*) FROM silver.ieee_cis_transactions WHERE is_fraud")
        ).scalar()

    print(f"Done: silver.ieee_cis_transactions — {count:,} rows, {fraud_count:,} fraud ({fraud_count/count*100:.3f}%)")


if __name__ == "__main__":
    main()