"""Read-only Postgres connection, used ONLY for executing LLM-generated SQL
(Ask-your-data). Deliberately separate from backend/db.py's admin engine —
even if an LLM is tricked into generating malicious SQL, this connection's
role (fraud_readonly, see setup_readonly_role.py) physically cannot write.
"""
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine

load_dotenv()

READONLY_USER = "fraud_readonly"
READONLY_PASSWORD = os.getenv("READONLY_DB_PASSWORD", "readonly_change_me")
HOST = os.getenv("POSTGRES_HOST", "localhost")
PORT = os.getenv("POSTGRES_PORT", "5432")
DB = os.getenv("POSTGRES_DB", "upi_fraud")

_readonly_engine = None


def get_readonly_engine():
    global _readonly_engine
    if _readonly_engine is None:
        url = f"postgresql+psycopg2://{READONLY_USER}:{READONLY_PASSWORD}@{HOST}:{PORT}/{DB}"
        _readonly_engine = create_engine(url)
    return _readonly_engine
