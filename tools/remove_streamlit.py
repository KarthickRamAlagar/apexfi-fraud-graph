"""Moves ApexFi from the Streamlit side-app to the React app only.  Run from the repo ROOT, AFTER the git mv step:

    git mv streamlit_app/data app_data
    python tools/remove_streamlit.py            # shows what it will change (nothing is written)
    python tools/remove_streamlit.py --apply    # writes the changes

What it does
  1. In every .py / .md / .yml / .json / .toml / .txt file (not data, not node_modules, not uv.lock) it changes the saved-results
     folder name:  streamlit_app/data -> app_data   and   "streamlit_app", "data" -> "app_data"
  2. backend/main.py: adds the two new routers (deep, ops) and the response-time timer. Nothing else in that file is touched.
  3. pyproject.toml: drops the streamlit and plotly packages (matplotlib, seaborn and pyarrow stay).
  4. README.md: removes the Streamlit run steps and mentions.   frontend/.env.example: drops VITE_STREAMLIT_URL.
  5. Prints every place that still says "streamlit" so you can look at it.
It never deletes anything. Deleting the old Streamlit files is a separate git rm step in the commands.
Line endings (CRLF / LF) are kept."""
import os, re, sys

APPLY = "--apply" in sys.argv
ROOT = os.getcwd()
SKIP_DIRS = {"tools", "retrain_logs", "node_modules", ".git", ".venv", "dist", "__pycache__", "streamlit_app", "app_data", "data", "zips", "scratch", "old_leaky_backup"}
EXTS = (".py", ".md", ".yml", ".yaml", ".json", ".toml", ".txt", ".example", ".jsx", ".js")
changes = []


def read(p):
    raw = open(p, "rb").read().decode("utf-8")
    return raw, "\r\n" in raw, raw.replace("\r\n", "\n")


def write(p, text, crlf):
    out = text.replace("\n", "\r\n") if crlf else text
    open(p, "wb").write(out.encode("utf-8"))


def edit(p, fn, what):
    if not os.path.exists(p):
        print(f"  {what}: file not found ({p})"); return
    raw, crlf, text = read(p)
    new = fn(text)
    if new == text:
        print(f"  {what}: nothing to change"); return
    changes.append(p); print(f"  {what}: will change" if not APPLY else f"  {what}: changed")
    if APPLY: write(p, new, crlf)


print("1. Saved-results folder name")
for dp, dns, fns in os.walk(ROOT):
    dns[:] = [d for d in dns if d not in SKIP_DIRS]
    for fn in fns:
        if not fn.endswith(EXTS) or fn in ("uv.lock", "remove_streamlit.py", "app_paths.py", "UI_MIGRATION.md"):
            continue
        p = os.path.join(dp, fn)
        try: raw, crlf, text = read(p)
        except Exception: continue
        new = text.replace("streamlit_app/data", "app_data").replace('"streamlit_app", "data"', '"app_data"').replace("'streamlit_app', 'data'", "'app_data'")
        if new != text:
            changes.append(p); print(f"  {os.path.relpath(p, ROOT)}")
            if APPLY: write(p, new, crlf)

print("2. backend/main.py")
def main_py(t):
    if "deep.router" in t:
        return t
    lines = t.split("\n")
    last = max((i for i, l in enumerate(lines) if l.startswith("app.include_router(")), default=None)
    first_app = next((i for i, l in enumerate(lines) if l.startswith("app = FastAPI(")), None)
    if last is None or first_app is None:
        raise SystemExit("backend/main.py looks different from expected. Send me the top 60 lines.")
    lines[last + 1:last + 1] = ["from backend.routers import deep, ops  # noqa: E402", "app.include_router(deep.router)   # Full Profiling, Raw Data Browser, Model Evaluation",
                                "app.include_router(ops.router)    # Ops page", "ops.add_latency_middleware(app)   # measures response time per route"]
    return "\n".join(lines)
edit(os.path.join(ROOT, "backend", "main.py"), main_py, "add deep + ops routers")

print("3. pyproject.toml")
def pyproject(t):
    t = re.sub(r'^\s*"streamlit[^"]*",.*\n', "", t, flags=re.M)
    t = re.sub(r'^\s*"plotly[^"]*",.*\n', "", t, flags=re.M)
    t = t.replace("# Stage 2: EDA — React EDA page support + standalone Streamlit app", "# Stage 2: EDA — React EDA pages (profiling, raw data) read the saved snapshot in app_data/")
    t = t.replace("# Parquet read/write for the Streamlit snapshot", "# Parquet read/write for the app_data snapshot")
    return t
edit(os.path.join(ROOT, "pyproject.toml"), pyproject, "drop streamlit + plotly")

print("4. README.md and frontend/.env.example")
def readme(t):
    t = t.replace("FastAPI + React web app, and a\nStreamlit deep-EDA app.", "FastAPI + React web app\n(dashboard, deep profiling, raw data browser, model evaluation, ops).")
    t = t.replace("(See the Streamlit\napp's Temporal Validation page", "(See the\nTemporal Validation page")
    t = re.sub(r"├── streamlit_app/.*\n(?:│.*\n)*?(?=├── backend/)", "├── app_data/                      # precomputed snapshots (parquet/json) the app reads; regenerate via\n│                                    # backend.services.export_snapshot when missing\n", t)
    t = re.sub(r"### Run the Streamlit deep-EDA app\n\n```bash\ncd streamlit_app\nuv run streamlit run Home.py\n```\n\n", "", t)
    t = t.replace("uv run streamlit run Home.py\n", "")
    return t
edit(os.path.join(ROOT, "README.md"), readme, "README")
edit(os.path.join(ROOT, "frontend", ".env.example"), lambda t: re.sub(r"(?m)^#[^\n]*(Explore More EDA|Local dev|Streamlit)[^\n]*\n|^VITE_STREAMLIT_URL=.*\n?", "", t), ".env.example")

print("\n5. Places that still say 'streamlit' (outside uv.lock and the old streamlit_app folder)")
left = 0
for dp, dns, fns in os.walk(ROOT):
    dns[:] = [d for d in dns if d not in SKIP_DIRS]
    for fn in fns:
        if fn in ("uv.lock", "remove_streamlit.py", "app_paths.py", "UI_MIGRATION.md") or not fn.endswith(EXTS + (".sh", ".ps1", ".cfg", ".ini", ".txt")):
            continue
        p = os.path.join(dp, fn)
        try: text = read(p)[2]
        except Exception: continue
        for i, line in enumerate(text.split("\n"), 1):
            if "streamlit" in line.lower():
                left += 1; print(f"  {os.path.relpath(p, ROOT)}:{i}: {line.strip()[:110]}")
if not left: print("  none")
print("\n" + ("Done. Now run: git diff --stat" if APPLY else "Nothing written yet. Run again with --apply."))
