"""Ops: is the system healthy, how fast is it, what data is it serving, where did the numbers come from.

Everything here is measured or read from a file. Where nothing has been measured the answer is None and the page shows "No data".
  GET /api/ops/health    cheap liveness check (used by the green LIVE chip)
  GET /api/ops/summary   the full Ops snapshot

Latency is measured by a small middleware (add_latency_middleware) and lives in memory: it resets when the server restarts.
"""
import json
import os
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import APIRouter, FastAPI, Request

from backend.services.app_paths import DATA_DIR, REPO_ROOT, data_path

router = APIRouter(prefix="/api/ops", tags=["ops"])
_STARTED = time.time()
_lat: dict = defaultdict(lambda: deque(maxlen=500))   # route -> recent durations (ms)
_err: dict = defaultdict(int)
_hits: dict = defaultdict(int)


def add_latency_middleware(app: FastAPI):
    @app.middleware("http")
    async def _timer(request: Request, call_next):
        t0 = time.perf_counter()
        status = 500
        try:
            resp = await call_next(request)
            status = resp.status_code
            return resp
        finally:
            p = request.url.path
            if p.startswith("/api/") and not p.startswith("/api/ops/"):
                route = request.scope.get("route")
                key = getattr(route, "path", p)
                _lat[key].append((time.perf_counter() - t0) * 1000)
                _hits[key] += 1
                if status >= 500:
                    _err[key] += 1


def _pct(vals, q):
    if not vals:
        return None
    s = sorted(vals)
    return round(s[min(len(s) - 1, int(round(q * (len(s) - 1))))], 1)


def _json(name):
    p = data_path(name)
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _db_check():
    try:
        from sqlalchemy import text
        from backend.db import engine
        t0 = time.perf_counter()
        with engine.connect() as c:
            c.execute(text("select 1"))
        return {"ok": True, "ms": round((time.perf_counter() - t0) * 1000, 1)}
    except Exception as e:
        return {"ok": False, "error": type(e).__name__}


@router.get("/health")
def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


@router.get("/summary")
def summary():
    files = []
    if os.path.isdir(DATA_DIR):
        for n in sorted(os.listdir(DATA_DIR)):
            p = os.path.join(DATA_DIR, n)
            if os.path.isfile(p):
                st = os.stat(p)
                files.append({"name": n, "kb": round(st.st_size / 1024, 1), "modified": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat()})
    lat = [{"route": k, "calls": _hits[k], "p50": _pct(list(v), .5), "p95": _pct(list(v), .95), "errors": _err[k]} for k, v in _lat.items()]
    lat.sort(key=lambda r: -(r["p95"] or 0))
    v2 = (_json("v2_summary.json") or {})
    fin = v2.get("final") or {}
    dgm = _json("model_metrics_dgraph_fin_stacked.json")
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "service": {"uptimeSeconds": round(time.time() - _STARTED), "snapshotFolder": os.path.basename(DATA_DIR), "snapshotFiles": len(files),
                    "database": _db_check()},
        "latency": {"note": "Measured since the server started; resets on restart.", "routes": lat,
                    "totalCalls": sum(_hits.values()), "totalErrors": sum(_err.values())},
        "dbOptimisation": _json("database_optimization.json"),
        "models": {
            "v2": {"labelledRecords": (v2.get("data") or {}).get("labelled_records"), "winner": (v2.get("decision") or {}).get("winner"),
                   "prAuc": fin.get("pr_auc"), "rocAuc": fin.get("roc_auc"), "protocol": v2.get("protocol")} if v2 else None,
            "dgraphStacked": dgm,
            "multiseed": {k: _json(f"multiseed_{k}.json") for k in ("ieee_cis", "dgraph_fin")},
        },
        "knownIssues": [
            {"id": "m4", "title": "M4 match-flag is empty in the Gold store",
             "detail": "The Silver step casts the text flags 'T'/'F' to true/false in a way that turns every M4 value into NULL. M4 has real values in Bronze (M0, M1, M2). "
                       "A side test that restored M4 gave no reliable PR-AUC gain (0.473 and 0.479 against 0.478 and 0.479), so the V2 results are unchanged. The ETL patch is kept out of the repo."},
            {"id": "dgraph-ts", "title": "DGraph-Fin retrained without node_timestamp",
             "detail": "The retrained stacked model scores ROC-AUC 0.778 and PR-AUC 0.038. See Model Evaluation and V2 Evaluation."},
        ],
        "lineage": [
            {"source": "IEEE-CIS Fraud Detection", "rows": (_json("summary_dashboard.json") or {}).get("ieee_cis", {}).get("total_transactions"), "role": "Card-not-present fraud, time-ordered"},
            {"source": "DGraph-Fin", "rows": (_json("summary_dashboard.json") or {}).get("dgraph_fin", {}).get("total_nodes"), "role": "User graph, 1,225,601 labelled accounts"},
            {"source": "NPCI / RBI payment series", "rows": None, "role": "Digital-payments volumes and money-market rates for the impact pages"},
        ],
        "snapshot": files,
    }
