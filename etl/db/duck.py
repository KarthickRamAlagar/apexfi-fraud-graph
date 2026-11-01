"""Optional DuckDB + Parquet data backend (used when DATA_BACKEND=duckdb).

Why it exists: the live (free-tier) deployment has no Postgres server. The
Gold tables are exported once to Parquet files (scripts/export_gold_parquet.py)
and queried in-process by DuckDB. Local development is unchanged — Postgres
stays the default and nothing here runs unless DATA_BACKEND=duckdb.

Every Parquet file  <GOLD_PARQUET_DIR>/<table>.parquet  becomes a view
gold.<table>, so all existing SQL (gold.ieee_cis_features, ...) works as is.

Safety: the engine is READ-ONLY by construction (only views over Parquet
exist) and is locked down after start-up: external access is limited to the
Parquet folder, extension auto-loading is off, and the configuration is
locked so no query can change it. This matters for "Ask your data", where
the SQL is written by an LLM.
"""
import os
import threading
from pathlib import Path

import duckdb
from sqlalchemy import create_engine

_lock = threading.Lock()
_root = None
_engine = None


def parquet_dir() -> Path:
    return Path(os.getenv("GOLD_PARQUET_DIR", "data/gold_parquet")).resolve()


def _sql_str(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def _build_root():
    folder = parquet_dir()
    files = sorted(folder.glob("*.parquet"))
    if not files:
        raise RuntimeError(
            f"DATA_BACKEND=duckdb but no .parquet files were found in {folder}. "
            "Run scripts/export_gold_parquet.py (or deploy/fetch_assets.py) first."
        )
    con = duckdb.connect(":memory:")
    con.execute("CREATE SCHEMA IF NOT EXISTS gold")
    for f in files:
        con.execute(
            f'CREATE OR REPLACE VIEW gold."{f.stem}" AS SELECT * FROM read_parquet({_sql_str(f.as_posix())})'
        )
    # resource limits + lock-down (order matters: lock last)
    con.execute(f"SET memory_limit = {_sql_str(os.getenv('DUCKDB_MEMORY_LIMIT', '4GB'))}")
    con.execute(f"SET threads = {int(os.getenv('DUCKDB_THREADS', '2'))}")
    con.execute(f"SET max_temp_directory_size = {_sql_str(os.getenv('DUCKDB_MAX_TEMP', '2GB'))}")
    con.execute("SET autoinstall_known_extensions = false")
    con.execute("SET autoload_known_extensions = false")
    con.execute(f"SET allowed_directories = [{_sql_str(folder.as_posix())}]")
    con.execute("SET enable_external_access = false")
    con.execute("SET lock_configuration = true")
    return con


def get_duck_engine():
    """One shared in-process DuckDB database; each SQLAlchemy connection gets
    its own cursor on it (so memory limits apply once, not per connection)."""
    global _root, _engine
    with _lock:
        if _engine is None:
            _root = _build_root()
            from duckdb_engine import ConnectionWrapper

            _engine = create_engine(
                "duckdb:///:memory:",
                creator=lambda: ConnectionWrapper(_root.cursor()),
            )
        return _engine
