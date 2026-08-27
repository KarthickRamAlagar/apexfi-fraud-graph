"""Load raw IEEE-CIS CSVs into Postgres bronze schema, as-is (no cleaning).

Bronze = untouched mirror of the source files. Column names are lowercased
(Postgres folds unquoted identifiers to lowercase anyway) but nothing else
changes. Cleaning/typing/joining happens later, in transform/bronze_to_silver.py.

Uses Postgres COPY (via a custom pandas insertion method) instead of row-by-row
INSERTs — dramatically faster for a table this wide (394 columns) and this
long (590k+ rows).
"""
import csv
from io import StringIO
from pathlib import Path

import pandas as pd
from sqlalchemy import text

from etl.db.connection import get_engine

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw_downloads" / "ieee_cis"
CHUNKSIZE = 100_000


def psql_insert_copy(table, conn, keys, data_iter):
    """pandas to_sql `method=` callable that uses COPY instead of INSERT."""
    dbapi_conn = conn.connection
    with dbapi_conn.cursor() as cur:
        s_buf = StringIO()
        writer = csv.writer(s_buf)
        writer.writerows(data_iter)
        s_buf.seek(0)
        columns = ", ".join(f'"{k}"' for k in keys)
        table_name = f'"{table.schema}"."{table.name}"' if table.schema else f'"{table.name}"'
        sql = f"COPY {table_name} ({columns}) FROM STDIN WITH CSV"
        cur.copy_expert(sql=sql, file=s_buf)


def load_csv_to_bronze(csv_path: Path, table_name: str, engine):
    print(f"Loading {csv_path.name} -> bronze.{table_name} ...")
    first_chunk = True
    total_rows = 0

    for chunk in pd.read_csv(csv_path, chunksize=CHUNKSIZE):
        chunk.columns = [c.lower() for c in chunk.columns]
        chunk.to_sql(
            table_name,
            engine,
            schema="bronze",
            if_exists="replace" if first_chunk else "append",
            index=False,
            method=psql_insert_copy,
        )
        total_rows += len(chunk)
        first_chunk = False
        print(f"  ...{total_rows:,} rows loaded")

    print(f"Done: bronze.{table_name} — {total_rows:,} rows total\n")


def main():
    engine = get_engine()

    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS bronze"))
        conn.commit()

    load_csv_to_bronze(RAW_DIR / "train_transaction.csv", "raw_ieee_cis_transaction", engine)
    load_csv_to_bronze(RAW_DIR / "train_identity.csv", "raw_ieee_cis_identity", engine)


if __name__ == "__main__":
    main()