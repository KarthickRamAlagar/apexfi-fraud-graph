"""Shared DB engine for FastAPI routes — reuses the same connection logic
as the ETL pipeline (etl/db/connection.py), same Postgres instance, same
.env config. Admin-level access — fine for our own read endpoints, but the
Ask-your-data LLM-driven queries use a SEPARATE, read-only connection
(see services/readonly_db.py), never this one.
"""
from etl.db.connection import get_engine

engine = get_engine()
