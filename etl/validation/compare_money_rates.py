import pandas as pd

from etl.db.connection import get_engine

engine = get_engine()

for table in ["raw_money_rates", "raw_money_rates_2000_2018"]:
    print(f"=== bronze.{table} ===")
    try:
        df = pd.read_sql(f"SELECT * FROM bronze.{table} LIMIT 20", engine)
        print(df.to_string())
    except Exception as e:
        print(f"  (couldn't read — {e})")
    print()