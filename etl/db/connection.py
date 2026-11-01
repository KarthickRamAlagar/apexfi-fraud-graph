"""Shared Postgres connection helper, used by every ETL stage."""
import os
from sqlalchemy import create_engine
from dotenv import load_dotenv

load_dotenv()


def get_engine():
    # Optional free-tier deployment: query Parquet files with DuckDB instead of
    # Postgres. Default (unset / "postgres") behaves exactly as before.
    if os.getenv("DATA_BACKEND", "postgres").lower() == "duckdb":
        from etl.db.duck import get_duck_engine

        return get_duck_engine()
    user = os.getenv("POSTGRES_USER", "fraud_admin")
    password = os.getenv("POSTGRES_PASSWORD", "changeme")
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "upi_fraud")
    url = f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{db}"
    return create_engine(url)
