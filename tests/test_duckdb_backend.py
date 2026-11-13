"""DuckDB/Parquet backend (free-tier deployment): needs no Postgres or models."""
import importlib
import time

import pytest

duckdb = pytest.importorskip("duckdb")
pytest.importorskip("duckdb_engine")
from sqlalchemy import text  # noqa: E402


@pytest.fixture()
def duck(tmp_path, monkeypatch):
    con = duckdb.connect(":memory:")
    con.execute(
        f"""COPY (SELECT i AS transactionid, (i % 10 = 0) AS is_fraud, (i * 1.5)::DECIMAL(10,2) AS transactionamt,
                   (1000 + i % 7) AS card1, 'Windows' AS deviceinfo, 1000 + i * 30 AS transactiondt
            FROM range(1, 501) t(i)) TO '{tmp_path}/ieee_cis_features.parquet' (FORMAT PARQUET)"""
    )
    con.execute(
        f"""COPY (SELECT 'dashboard' AS dataset_key, '{{"fraudRate": 3.5}}'::JSON AS payload, now() AS computed_at)
            TO '{tmp_path}/precomputed_summary.parquet' (FORMAT PARQUET)"""
    )
    monkeypatch.setenv("DATA_BACKEND", "duckdb")
    monkeypatch.setenv("GOLD_PARQUET_DIR", str(tmp_path))
    import etl.db.duck as duck_mod

    importlib.reload(duck_mod)  # fresh singleton for this test
    from etl.db.connection import get_engine

    return get_engine()


def test_gold_views_and_postgres_style_sql(duck):
    with duck.connect() as c:
        assert c.execute(text("SELECT COUNT(*) FROM gold.ieee_cis_features")).scalar() == 500
        ids = c.execute(
            text("SELECT transactionid FROM gold.ieee_cis_features WHERE transactionid = ANY(:ids) ORDER BY 1"),
            {"ids": [3, 4, 5]},
        ).fetchall()
        assert [r[0] for r in ids] == [3, 4, 5]
        like = c.execute(
            text("SELECT transactionid FROM gold.ieee_cis_features WHERE transactionid::text LIKE :p ORDER BY 1 LIMIT 3"),
            {"p": "49%"},
        ).fetchall()
        assert [r[0] for r in like] == [49, 490, 491]
        row = c.execute(
            text("SELECT percentile_disc(0.75) WITHIN GROUP (ORDER BY transactiondt) AS s FROM gold.ieee_cis_features")
        ).fetchone()
        assert row.s > 1000


def test_json_payload_is_normalised(duck):
    from etl.db.jsonutil import as_json

    with duck.connect() as c:
        row = c.execute(text("SELECT payload FROM gold.precomputed_summary WHERE dataset_key='dashboard'")).fetchone()
    assert as_json(row.payload) == {"fraudRate": 3.5}
    assert as_json({"a": 1}) == {"a": 1}  # Postgres already gives a dict


def test_engine_is_locked_down(duck):
    """A tricked model must not be able to read server files or change settings."""
    for q in [
        "SELECT * FROM read_text('/etc/passwd')",
        "SELECT * FROM glob('/*')",
        "SET enable_external_access = true",
        "ATTACH '/tmp/evil.db'",
        "INSTALL httpfs",
    ]:
        with pytest.raises(Exception):
            with duck.connect() as c:
                c.execute(text(q)).fetchall()
    with duck.connect() as c:  # and the engine still works afterwards
        assert c.execute(text("SELECT 1")).scalar() == 1


def test_ask_validator_blocks_file_and_system_functions():
    from backend.routers.ask import validate_sql

    validate_sql("SELECT COUNT(*) FROM gold.ieee_cis_features WHERE is_fraud")
    for bad in [
        "SELECT * FROM read_csv('/etc/passwd')",
        "SELECT * FROM glob('/*')",
        "SELECT pg_read_file('/etc/passwd')",
        "SELECT * FROM duckdb_views()",
        "SELECT * FROM information_schema.tables",
        "SELECT 1; SET threads = 1",
        "SELECT * FROM gold.x WHERE a = 1; DROP TABLE gold.x",
    ]:
        with pytest.raises(ValueError):
            validate_sql(bad)


def test_run_readonly_query_caps_rows_and_times_out(duck, monkeypatch):
    import backend.routers.ask as ask

    cols, rows = ask.run_readonly_query(duck, "SELECT transactionid FROM gold.ieee_cis_features ORDER BY 1;")
    assert cols == ["transactionid"] and len(rows) == min(ask.MAX_ROWS, 500)

    monkeypatch.setattr(ask, "STATEMENT_TIMEOUT_MS", 1000)
    t0 = time.time()
    with pytest.raises(Exception):
        ask.run_readonly_query(duck, "SELECT SUM(a.i * b.i) FROM range(200000) a(i), range(200000) b(i)")
    assert time.time() - t0 < 10
    assert ask.run_readonly_query(duck, "SELECT 1 AS ok")[1][0][0] == 1  # still usable


def test_ask_daily_cap(monkeypatch):
    import backend.routers.ask as ask

    monkeypatch.setattr(ask, "DAILY_CAP", 2)
    ask._cap_state.update(day=None, count=0)
    assert ask._take_daily_slot() and ask._take_daily_slot()
    assert not ask._take_daily_slot()
    monkeypatch.setattr(ask, "DAILY_CAP", 0)  # 0 = unlimited
    assert ask._take_daily_slot()
