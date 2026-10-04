from sqlalchemy import text

from etl.db.connection import get_engine

engine = get_engine()

query = """
SELECT fiscal_year,
       COUNT(*) AS total,
       COUNT(bank_rate) AS matched
FROM gold.ieee_cis_features
GROUP BY fiscal_year
ORDER BY fiscal_year
"""
with engine.connect() as conn:
    rows = conn.execute(text(query)).fetchall()

print(f"{'Fiscal Year':15} {'Total':>10} {'Matched':>10}")
for row in rows:
    print(f"{row.fiscal_year:15} {row.total:>10,} {row.matched:>10,}")