"""Export the Postgres Gold schema to Parquet files (READ-ONLY on Postgres).

Nothing in Postgres is changed: the database is attached READ_ONLY and the
tables are only read. Output goes to a NEW folder (default data/gold_parquet).

    uv run python -m scripts.export_gold_parquet              # export all gold tables
    uv run python -m scripts.export_gold_parquet --list       # just show what would be exported
    uv run python -m scripts.export_gold_parquet --only precomputed_summary

Uses DuckDB's postgres extension (downloaded once, needs internet).
Large tables are sorted by their lookup key so point lookups in the live app
read only a few row groups.
"""
import argparse
import os
import time
from pathlib import Path

import duckdb
from dotenv import load_dotenv

load_dotenv()

# lookup key per big table (used for ORDER BY so Parquet min/max stats prune well)
SORT_KEYS = {
    "ieee_cis_features": "transactionid",
    "ieee_cis_transaction_edges": "src_transactionid",
    "dgraph_fin_nodes": "node_id",
    "dgraph_fin_edges": "src_node_id",
}


def _s(v):
    return "'" + str(v).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.getenv("GOLD_PARQUET_DIR", "data/gold_parquet"))
    ap.add_argument("--schema", default="gold")
    ap.add_argument("--only", nargs="*", help="export just these table names")
    ap.add_argument("--list", action="store_true", help="list tables and row counts, export nothing")
    args = ap.parse_args()

    conn_str = (
        f"host={os.getenv('POSTGRES_HOST', 'localhost')} port={os.getenv('POSTGRES_PORT', '5432')} "
        f"dbname={os.getenv('POSTGRES_DB', 'upi_fraud')} user={os.getenv('POSTGRES_USER', 'fraud_admin')} "
        f"password={os.getenv('POSTGRES_PASSWORD', 'changeme')}"
    )
    con = duckdb.connect(":memory:")
    con.execute("INSTALL postgres")
    con.execute("LOAD postgres")
    con.execute(f"ATTACH {_s(conn_str)} AS pg (TYPE postgres, READ_ONLY)")

    tables = [
        r[0]
        for r in con.execute(
            "SELECT table_name FROM duckdb_tables() WHERE database_name='pg' AND schema_name=? ORDER BY 1",
            [args.schema],
        ).fetchall()
        if not r[0].startswith("_")  # skip temporary helper tables like _tmp_edges_*
    ]
    if args.only:
        tables = [t for t in tables if t in set(args.only)]

    out = Path(args.out)
    if not args.list:
        out.mkdir(parents=True, exist_ok=True)
        con.execute("SET temp_directory = " + _s((out / "_tmp").as_posix()))

    total = 0
    for t in tables:
        n = con.execute(f'SELECT COUNT(*) FROM pg."{args.schema}"."{t}"').fetchone()[0]
        print(f"{t:45s} {n:>12,} rows", end="")
        if args.list:
            print()
            continue
        order = f' ORDER BY "{SORT_KEYS[t]}"' if t in SORT_KEYS else ""
        target = out / f"{t}.parquet"
        t0 = time.time()
        con.execute(
            f'COPY (SELECT * FROM pg."{args.schema}"."{t}"{order}) TO {_s(target.as_posix())} '
            "(FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)"
        )
        size = target.stat().st_size
        total += size
        print(f"  -> {size / 1e6:8.1f} MB  ({time.time() - t0:.0f}s)")

    if not args.list:
        print(f"\nDone. {len(tables)} files, {total / 1e6:.0f} MB total, in {out}")
        print("Postgres was only read. Nothing was changed there.")
        tmp = out / "_tmp"
        if tmp.exists():
            for f in tmp.glob("*"):
                f.unlink()
            tmp.rmdir()


if __name__ == "__main__":
    main()
