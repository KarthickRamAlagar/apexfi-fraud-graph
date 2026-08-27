"""Load manually-downloaded RBI/NPCI CSVs into Bronze.

Most data.gov.in / DBIE / NPCI datasets don't have a working API, so they're
downloaded by hand from the portal and dropped into data/raw_downloads/rbi_npci/.
This script picks up every CSV in that folder and loads each one into its own
bronze table, named after the file (lowercased, spaces -> underscores).

Usage:
  1. Download a dataset's CSV from data.gov.in (or DBIE/NPCI directly).
  2. Save it as data/raw_downloads/rbi_npci/<descriptive_name>.csv
  3. Run this script — it loads every CSV found, one table per file.
"""
import re
from pathlib import Path

import pandas as pd
from sqlalchemy import text

from etl.db.connection import get_engine

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw_downloads" / "rbi_npci"


def table_name_from_filename(path: Path) -> str:
    name = path.stem.lower()
    name = re.sub(r"[^a-z0-9]+", "_", name)  # collapse any non-alphanumeric run into _
    name = name.strip("_")
    return "raw_" + name


def main():
    engine = get_engine()
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS bronze"))
        conn.commit()

    if not RAW_DIR.exists():
        print(f"No folder found at {RAW_DIR} — create it and add CSVs first.")
        return

    csv_files = sorted(RAW_DIR.glob("*.csv"))
    if not csv_files:
        print(f"No CSV files found in {RAW_DIR}")
        return

    for csv_path in csv_files:
        table_name = table_name_from_filename(csv_path)
        print(f"Loading {csv_path.name} -> bronze.{table_name} ...")
        df = pd.read_csv(csv_path)
        df.columns = [c.lower().strip().replace(" ", "_") for c in df.columns]
        df.to_sql(table_name, engine, schema="bronze", if_exists="replace", index=False)
        print(f"  Loaded {len(df):,} rows, {len(df.columns)} columns -> bronze.{table_name}\n")


if __name__ == "__main__":
    main()