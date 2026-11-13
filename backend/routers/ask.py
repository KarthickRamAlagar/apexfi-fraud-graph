"""Ask your data — real text-to-SQL endpoint.

Approach: schema-in-prompt (not full RAG with a vector store) — at only 7
Gold tables, the whole schema fits comfortably in one prompt, so a vector
database would be more infrastructure than this scale needs.

Safety guards, in order:
  1. LLM is instructed to output ONLY a single SELECT statement.
  2. The returned SQL is validated: must start with SELECT, must not contain
     any write/DDL keywords, must be a single statement (no ';' followed by
     more SQL — blocks statement-stacking injection).
  3. Executed via a genuinely separate, read-only Postgres role
     (fraud_readonly — see setup_readonly_role.py) that physically cannot
     write, even if steps 1-2 were somehow bypassed.
  4. A statement timeout and a hard row cap protect against runaway queries.
  5. Blocked: file/system functions (read_*, glob, pg_*, duckdb_*, ...) so a
     tricked model can't read server files; with DATA_BACKEND=duckdb the
     engine is additionally locked to the Parquet folder (see etl/db/duck.py).
  6. A global daily question cap (ASK_DAILY_CAP, default 500) keeps a public
     demo from exhausting the free LLM quotas.
"""
import os
import re
import threading
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from backend.services.llm_providers import call_llm_with_fallback
from backend.services.readonly_db import get_readonly_engine

router = APIRouter(prefix="/api/ask", tags=["ask"])

MAX_ROWS = 100
STATEMENT_TIMEOUT_MS = 10_000

SCHEMA_DESCRIPTION = """
You have READ-ONLY access to a PostgreSQL database (schema "gold") for a UPI/IMPS fraud-detection project. Tables:

gold.ieee_cis_features (590,540 rows) — one row per card transaction.
  Key columns: transactionid (int, PK), is_fraud (boolean, target), transactionamt (numeric, USD),
  productcd (text), card1 (int), deviceinfo (text), transaction_date (date),
  day_of_week (int, 0=Sun..6=Sat), hour_of_day (int, 0-23), fiscal_year (text, e.g. '2017-18'),
  bank_rate (numeric, RBI rate for that fiscal year, may be NULL for FY2018-19).
  Also has 339 anonymized columns v1..v339, 14 count features c1..c14, 15 time-delta features d1..d15,
  and 9 match-flag booleans m1..m9. Real fraud rate: 3.499%.

gold.ieee_cis_transaction_edges — graph edges between transactions.
  Columns: src_transactionid, dst_transactionid, edge_type ('device_shared' or 'card_shared').
  device_shared is the strong real fraud signal (lift ~4x); card_shared is weak (~1x).

gold.dgraph_fin_nodes (3,700,550 rows) — one row per user in a financial social network.
  Key columns: node_id (int, PK), label (text: 'normal'/'fraud'/'background'), total_degree (int,
  number of connections), node_timestamp (int, only non-null for fraud-labeled nodes),
  x0..x16 (anonymized numeric features). Real fraud rate among labeled nodes: 1.27%.

gold.dgraph_fin_edges — emergency-contact connections between users.
  Columns: src_node_id, dst_node_id, edge_type, edge_timestamp.

gold.rbi_money_rates (18 rows) — real RBI interest rates by fiscal year, 2000-01 to 2017-18.
  Columns: fiscal_year, bank_rate, sbi_lending_rate, call_money_rate.

gold.npci_digital_payments_quarterly (4 rows) and gold.npci_digital_payments_monthly (12 rows) —
  real NPCI digital payment volume/value data.

Rules:
- Output ONLY a single valid PostgreSQL SELECT statement. No markdown, no explanation, no code fences.
- Never write INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/GRANT — you cannot anyway (read-only role), but never attempt it.
- Always qualify table names with the gold schema, e.g. gold.ieee_cis_features.
- If the question can't be answered from this schema, output exactly: SELECT 'Cannot be answered from the available schema.' AS message;
"""

FORBIDDEN_KEYWORDS = [
    "insert", "update", "delete", "drop", "alter", "create", "grant", "revoke",
    "truncate", "copy", "call", "do", "vacuum", "reindex",
    "attach", "detach", "install", "load", "pragma", "set", "export", "import",
    "checkpoint", "information_schema",
]
# file / system access functions (DuckDB read_csv, read_text, glob, parquet_*, duckdb_* catalogs; Postgres pg_*)
FORBIDDEN_PATTERNS = [r"\bread_\w+", r"\bglob\b", r"\bparquet_\w+", r"\bduckdb_\w+", r"\bpg_\w+",
                      r"\bcurrent_setting\b", r"\bsql_auto_complete\b", r"\bquery_table\b", r"\bcsv_\w+"]

DAILY_CAP = int(os.getenv("ASK_DAILY_CAP", "500"))  # 0 = unlimited
_cap_lock = threading.Lock()
_cap_state = {"day": None, "count": 0}


def _take_daily_slot():
    """Count one question against today's global budget. False when the budget is used up."""
    if DAILY_CAP <= 0:
        return True
    today = time.strftime("%Y-%m-%d", time.gmtime())
    with _cap_lock:
        if _cap_state["day"] != today:
            _cap_state.update(day=today, count=0)
        if _cap_state["count"] >= DAILY_CAP:
            return False
        _cap_state["count"] += 1
        return True

LANGUAGE_NAMES = {
    "en-IN": "English",
    "ta-IN": "Tamil",
    "kn-IN": "Kannada",
    "te-IN": "Telugu",
    "ml-IN": "Malayalam",
}


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    language: str = Field(default="en-IN", max_length=16)


def extract_sql(raw_response):
    # strip markdown code fences if present, keeping only the fenced content
    fence_match = re.search(r"```(?:sql)?\s*(.*?)```", raw_response, re.DOTALL | re.IGNORECASE)
    text_to_search = fence_match.group(1) if fence_match else raw_response

    # models sometimes prepend prose ("Here's the query:") even without a
    # fence — find the first real SELECT and cut everything before it
    select_match = re.search(r"\bselect\b", text_to_search, re.IGNORECASE)
    if select_match:
        text_to_search = text_to_search[select_match.start():]

    return text_to_search.strip()


def validate_sql(sql):
    lowered = sql.lower().strip()
    if not lowered.startswith("select"):
        raise ValueError("Generated query does not start with SELECT.")

    semicolon_pos = sql.find(";")
    if semicolon_pos != -1 and sql[semicolon_pos + 1:].strip():
        raise ValueError("Multiple SQL statements are not allowed.")

    for kw in FORBIDDEN_KEYWORDS:
        if re.search(rf"\b{kw}\b", lowered):
            raise ValueError(f"Query contains a forbidden keyword: {kw}")
    for pattern in FORBIDDEN_PATTERNS:
        if re.search(pattern, lowered):
            raise ValueError("Query uses a function that is not allowed.")


def run_readonly_query(engine, sql):
    """Execute the validated SELECT with a hard row cap and a real timeout.
    Postgres: SET statement_timeout. DuckDB (no such setting): interrupt the query from a timer."""
    limited = f"SELECT * FROM ({sql.rstrip().rstrip(';')}) AS _ask LIMIT {MAX_ROWS}"
    is_duck = engine.dialect.name == "duckdb"
    with engine.connect() as conn:
        timer = None
        if is_duck:
            raw = conn.connection.driver_connection
            timer = threading.Timer(STATEMENT_TIMEOUT_MS / 1000, raw.interrupt)
            timer.start()
        else:
            conn.execute(text(f"SET statement_timeout = {STATEMENT_TIMEOUT_MS}"))
        try:
            result = conn.execute(text(limited))
            rows = result.fetchmany(MAX_ROWS)
            columns = list(result.keys())
        finally:
            if timer:
                timer.cancel()
    return columns, rows


@router.post("/")
def ask_question(req: AskRequest):
    # req.language still matters for the frontend's speech-recognition
    # (voice input in Tamil/Kannada/etc.), but the answer itself is
    # always written in English now — see note below on why.

    if not _take_daily_slot():
        raise HTTPException(429, "The daily limit for questions on this demo has been reached. Please try again tomorrow.")

    sql_prompt = f"Question: {req.question}\n\nWrite the PostgreSQL SELECT query to answer this."
    try:
        raw_sql, provider = call_llm_with_fallback(SCHEMA_DESCRIPTION, sql_prompt)
    except RuntimeError as e:
        print(f"[ask] LLM provider failure: {e}")
        raise HTTPException(503, "The AI assistant is unavailable right now. Please try again shortly.")

    sql = extract_sql(raw_sql)

    try:
        validate_sql(sql)
    except ValueError as e:
        print(f"[ask] SQL rejected by validator: {e}")
        raise HTTPException(400, "That question could not be turned into a safe read-only query. Please rephrase it.")

    engine = get_readonly_engine()
    try:
        columns, rows = run_readonly_query(engine, sql)
    except Exception as e:
        print(f"[ask] query execution failed: {e}")
        raise HTTPException(400, "The query could not be run. Please rephrase your question.")

    results = [dict(zip(columns, row)) for row in rows]

    answer_prompt = (
        f"The question was: {req.question}\n"
        f"The real query result (as JSON) is: {results[:20]}\n"
        f"Write a short, direct answer in English, citing the real numbers. "
        f"One or two sentences. No SQL, no markdown."
    )
    try:
        answer_text, _ = call_llm_with_fallback(
            "You are a precise financial-data assistant. Answer only from the given real data.",
            answer_prompt,
        )
    except RuntimeError:
        answer_text = str(results[:5])

    return {
        "question": req.question,
        "answer": answer_text,
        "sql": sql,
        "results": results,
        "resultCount": len(results),
        "provider": provider,
        "isFallback": False,
    }