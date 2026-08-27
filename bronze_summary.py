from sqlalchemy import text

from etl.db.connection import get_engine

engine = get_engine()

TABLES = [
    "raw_ieee_cis_transaction",
    "raw_ieee_cis_identity",
    "raw_dgraph_fin_nodes",
    "raw_dgraph_fin_edges",
    "raw_money_rates_2000_2018",
    "raw_digital_payment_transactions",
    "raw_digital_payment_volume_monthly",
]

lines = []
lines.append(f"{'Table':45} {'Rows':>12} {'Columns':>8}")
lines.append("-" * 67)

with engine.connect() as conn:
    for table in TABLES:
        try:
            row_count = conn.execute(text(f"SELECT COUNT(*) FROM bronze.{table}")).scalar()
            col_count = conn.execute(
                text(
                    "SELECT COUNT(*) FROM information_schema.columns "
                    "WHERE table_schema='bronze' AND table_name=:t"
                ),
                {"t": table},
            ).scalar()
            lines.append(f"{table:45} {row_count:>12,} {col_count:>8}")
        except Exception as e:
            lines.append(f"{table:45} {'ERROR':>12} {str(e)[:30]}")

output = "\n".join(lines)
print(output)

with open("bronze_summary.txt", "w") as f:
    f.write(output + "\n")

print("\nSaved to bronze_summary.txt")