"""One-time, idempotent edits to EXISTING files for the free-tier deployment.
Safe to run twice. Prints what it changed. Changes nothing about behaviour when
DATA_BACKEND is unset (Postgres stays the default).

    uv run python -m scripts.apply_deploy_patch
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
changed = []


def edit(rel, fn, note):
    p = ROOT / rel
    if not p.exists():
        print(f"  skip   {rel} (not found)")
        return
    raw = p.read_bytes().decode("utf-8")
    crlf = "\r\n" in raw  # keep Windows line endings so git diffs stay small
    old = raw.replace("\r\n", "\n")
    new = fn(old)
    if new == old:
        print(f"  ok     {rel} (already patched)")
        return
    if crlf:
        new = new.replace("\n", "\r\n")
    p.write_bytes(new.encode("utf-8"))
    changed.append(rel)
    print(f"  PATCH  {rel}: {note}")


def add_import(src):
    if "from etl.db.jsonutil import as_json" in src:
        return src
    return src.replace("from backend.db import engine", "from backend.db import engine\nfrom etl.db.jsonutil import as_json", 1)


# 1) JSON columns: Postgres gives a dict, Parquet/DuckDB gives text -> normalise
for rel, a, b in [
    ("backend/routers/dashboard.py", "return row.payload", "return as_json(row.payload)"),
    ("backend/routers/datasets.py", "return row.payload", "return as_json(row.payload)"),
    ("backend/routers/analytics.py", "payload = row.payload", "payload = as_json(row.payload)"),
    ("backend/routers/eda.py", "payload = row.payload", "payload = as_json(row.payload)"),
]:
    edit(rel, lambda s, a=a, b=b: add_import(s.replace(a, b)), "JSON payload via as_json()")

# 2) random sample of unlabeled accounts: TABLESAMPLE syntax differs on DuckDB
def sample_fix(src):
    if "dialect.name" in src:
        return src
    pat = re.compile(
        r'with engine\.connect\(\) as conn:\n(\s+)rows = conn\.execute\(\n\s+text\(\n\s+"""SELECT node_id, total_degree FROM gold\.dgraph_fin_nodes\n\s+TABLESAMPLE SYSTEM \(1\)\n\s+WHERE label NOT IN \(\'fraud\', \'normal\'\)\n\s+LIMIT 8"""\n\s+\)\n\s+\)\.fetchall\(\)'
    )
    m = pat.search(src)
    if not m:
        print("  WARN   dgraph_fin_score.py: sample query not in the expected form - left untouched")
        return src
    ind = m.group(1)
    repl = (
        "if engine.dialect.name == \"duckdb\":\n"
        f"{ind[:-4]}    sample_sql = (\"SELECT node_id, total_degree FROM gold.dgraph_fin_nodes \"\n"
        f"{ind[:-4]}                  \"WHERE label NOT IN ('fraud', 'normal') ORDER BY random() LIMIT 8\")\n"
        f"{ind[:-4]}else:\n"
        f"{ind[:-4]}    sample_sql = (\"SELECT node_id, total_degree FROM gold.dgraph_fin_nodes TABLESAMPLE SYSTEM (1) \"\n"
        f"{ind[:-4]}                  \"WHERE label NOT IN ('fraud', 'normal') LIMIT 8\")\n"
        f"{ind[:-4]}with engine.connect() as conn:\n"
        f"{ind}rows = conn.execute(text(sample_sql)).fetchall()"
    )
    return src[: m.start()] + repl + src[m.end():]


edit("backend/routers/dgraph_fin_score.py", sample_fix, "sample query works on Postgres and DuckDB")

# 3) front end: API address from an environment variable (Vercel), default unchanged
for rel in ["frontend/src/lib/api.js", "frontend/src/pages/AskYourData.jsx"]:
    edit(
        rel,
        lambda s: s.replace(
            "const API_BASE = 'http://localhost:8000'",
            "const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'",
        ),
        "API base from VITE_API_BASE",
    )

# 4) Streamlit: links to the React app come from REACT_APP_URL (env or Streamlit secrets)
def streamlit_links(src):
    if "_APP_URL" in src:
        return src
    src = re.sub(r'"http://localhost:5173/(?:#/)?([a-z-]+)"', r'f"{_APP_URL}/\1"', src)
    helper = (
        "def _react_app_url():\n"
        "    import os\n"
        "    url = os.getenv(\"REACT_APP_URL\")\n"
        "    if not url:\n"
        "        try:\n"
        "            url = st.secrets.get(\"REACT_APP_URL\")\n"
        "        except Exception:\n"
        "            url = None\n"
        "    return (url or \"http://localhost:5173\").rstrip(\"/\")\n\n\n"
        "_APP_URL = _react_app_url()\n\n"
    )
    marker = 'st.markdown("**Try it live'
    i = src.find(marker)
    return src if i == -1 else src[:i] + helper + src[i:]


edit("streamlit_app/pages/3_Model_Evaluation.py", streamlit_links, "links use REACT_APP_URL")

# 5) never commit the exported Parquet files
def gitignore(src):
    if "data/gold_parquet" in src:
        return src
    return src.rstrip("\n") + "\n\n# exported Parquet copy of the Gold layer (goes to Hugging Face, not git)\ndata/gold_parquet/\n"


edit(".gitignore", gitignore, "ignore data/gold_parquet/")

# 6) document the new settings
def env_example(src):
    if "DATA_BACKEND" in src:
        return src
    return src.rstrip("\n") + """

# --- Free-tier deployment (Hugging Face Space + Parquet) ---
# postgres (default, local development) or duckdb (query exported Parquet files; used on the Space)
DATA_BACKEND=postgres
# Folder with the exported Gold Parquet files (scripts/export_gold_parquet.py writes here)
GOLD_PARQUET_DIR=data/gold_parquet
DUCKDB_MEMORY_LIMIT=4GB
# Max "Ask your data" questions per day for the whole site (0 = unlimited)
ASK_DAILY_CAP=500
# Used by deploy/ scripts only - never commit real values
# HF_TOKEN=
# HF_SPACE_TOKEN=
# HF_MODEL_REPO=youruser/apexfi-models
# HF_DATA_REPO=youruser/apexfi-data
# REACT_APP_URL=https://your-app.vercel.app
"""


edit(".env.example", env_example, "new settings documented")

print(f"\n{len(changed)} file(s) changed.")
