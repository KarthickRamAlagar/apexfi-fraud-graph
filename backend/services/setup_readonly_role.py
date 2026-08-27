"""One-time setup: creates a READ-ONLY Postgres role for the Ask-your-data
feature. This is a critical safety guard — even if an LLM is tricked into
generating a malicious SQL statement (DROP, DELETE, UPDATE, etc.), this
role physically cannot execute it, because it only has SELECT granted.

Run once. Safe to re-run.
"""
import os

from sqlalchemy import text

from etl.db.connection import get_engine

READONLY_USER = "fraud_readonly"
READONLY_PASSWORD = os.getenv("READONLY_DB_PASSWORD", "readonly_change_me")


def main():
    engine = get_engine()
    with engine.connect() as conn:
        conn.execute(text("COMMIT"))  # exit any implicit transaction — role creation needs autocommit-ish

        exists = conn.execute(
            text("SELECT 1 FROM pg_roles WHERE rolname = :name"), {"name": READONLY_USER}
        ).fetchone()

        if exists:
            print(f"Role '{READONLY_USER}' already exists — updating password only.")
            conn.execute(text(f"ALTER ROLE {READONLY_USER} WITH PASSWORD :pw"), {"pw": READONLY_PASSWORD})
        else:
            print(f"Creating role '{READONLY_USER}'...")
            conn.execute(
                text(f"CREATE ROLE {READONLY_USER} WITH LOGIN PASSWORD :pw"), {"pw": READONLY_PASSWORD}
            )
        conn.commit()

        print("Granting read-only access to the gold schema...")
        conn.execute(text(f"GRANT CONNECT ON DATABASE upi_fraud TO {READONLY_USER}"))
        conn.execute(text(f"GRANT USAGE ON SCHEMA gold TO {READONLY_USER}"))
        conn.execute(text(f"GRANT SELECT ON ALL TABLES IN SCHEMA gold TO {READONLY_USER}"))
        conn.execute(
            text(f"ALTER DEFAULT PRIVILEGES IN SCHEMA gold GRANT SELECT ON TABLES TO {READONLY_USER}")
        )
        conn.commit()

    print(f"\nDone. Role '{READONLY_USER}' can SELECT from gold.* only — no INSERT/UPDATE/DELETE/DROP.")
    print(f"Set READONLY_DB_PASSWORD in .env to match what you used here (default shown if unset).")


if __name__ == "__main__":
    main()
