"""Pull real RBI/data.gov.in datasets into Bronze.

Two paths, since data.gov.in only has live APIs for a subset of datasets
(most, including RBI's DBIE-sourced ones, are download-only):

  1. API path: datasets that DO have a working data.gov.in API — fetched here
     directly via requests, no manual download needed.
  2. CSV path: datasets without an API — download manually from the portal and
     drop the CSV into data/raw_downloads/rbi_npci/, then run
     etl/load/load_rbi_npci_bronze.py to load them (see that file).

Requires DATA_GOV_IN_API_KEY in .env.
"""
import os
import time
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv
from sqlalchemy import text

from etl.db.connection import get_engine

load_dotenv()

API_KEY = os.getenv("DATA_GOV_IN_API_KEY")
BASE_URL = "https://api.data.gov.in/resource/{resource_id}"

# Datasets confirmed to have a working data.gov.in API.
# Note: raw_rbi_bank_fraud_amounts (0c87a3e6-...) was dropped — its API
# times out consistently and the dataset isn't essential to the project
# (small, static, historical; real RBI/NPCI context is already covered by
# Money Rates + UPI transactions). Download it manually as a CSV later if
# you ever want it.
API_DATASETS = {
    "raw_npci_upi_transactions_2022": "a40ccebb-b1e7-4245-8801-a9f38eb8cab6",
}


def fetch_resource(resource_id: str, limit: int = 500, max_retries: int = 4) -> pd.DataFrame:
    """Fetch all records for one resource, paging through in small batches with retries.

    The gov API can be slow/flaky, so we use a smaller page size (500, not
    10,000) and retry each page a few times with backoff before giving up.
    """
    all_records = []
    offset = 0

    while True:
        url = BASE_URL.format(resource_id=resource_id)
        params = {"api-key": API_KEY, "format": "json", "limit": limit, "offset": offset}

        for attempt in range(1, max_retries + 1):
            try:
                resp = requests.get(url, params=params, timeout=60)
                resp.raise_for_status()
                payload = resp.json()
                break
            except (requests.exceptions.RequestException, ValueError) as e:
                if attempt == max_retries:
                    raise
                wait = 2 ** attempt
                print(f"  request failed ({e}), retrying in {wait}s (attempt {attempt}/{max_retries})...")
                time.sleep(wait)

        records = payload.get("records", [])
        if not records:
            break

        all_records.extend(records)
        offset += limit
        print(f"  ...{len(all_records):,} records fetched so far")

        total = int(payload.get("total", 0))
        if offset >= total:
            break

    return pd.DataFrame(all_records)


def main():
    if not API_KEY:
        raise RuntimeError("DATA_GOV_IN_API_KEY not set in .env")

    engine = get_engine()
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS bronze"))
        conn.commit()

    for table_name, resource_id in API_DATASETS.items():
        print(f"Fetching resource {resource_id} -> bronze.{table_name} ...")
        df = fetch_resource(resource_id)
        if df.empty:
            print(f"  WARNING: no records returned for {resource_id}")
            continue
        df.columns = [c.lower() for c in df.columns]
        df.to_sql(table_name, engine, schema="bronze", if_exists="replace", index=False)
        print(f"  Loaded {len(df):,} rows -> bronze.{table_name}\n")


if __name__ == "__main__":
    main()