"""Prometheus metrics for Grafana. GET /metrics (plain text, Prometheus exposition format). No extra package needed.

Everything printed is measured: request counts, errors and response times come from the same in-memory meters the Ops page uses;
database status is a real "select 1"; model scores are read from the saved result files. Nothing is invented.
"""
import json
import time

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from backend.routers import ops
from backend.services.app_paths import data_path

router = APIRouter(tags=["metrics"])


def _esc(v: str) -> str:
    return str(v).replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")


def _model_scores():
    try:
        with open(data_path("v2_summary.json"), encoding="utf-8") as f:
            s = json.load(f)
        return s["final"], s["v1"]
    except Exception:
        return None, None


@router.get("/metrics", response_class=PlainTextResponse)
def metrics():
    out = []

    def head(name, help_, typ):
        out.append(f"# HELP {name} {help_}")
        out.append(f"# TYPE {name} {typ}")

    head("apexfi_up", "1 while the API is running", "gauge")
    out.append("apexfi_up 1")
    head("apexfi_uptime_seconds", "Seconds since the API started", "gauge")
    out.append(f"apexfi_uptime_seconds {time.time() - ops._STARTED:.1f}")

    db = ops._db_check()
    head("apexfi_database_up", "1 when a test query to the database works", "gauge")
    out.append(f"apexfi_database_up {1 if db.get('ok') else 0}")
    if db.get("ok"):
        head("apexfi_database_query_ms", "Time of a test query to the database, in milliseconds", "gauge")
        out.append(f"apexfi_database_query_ms {db['ms']}")

    head("apexfi_http_requests_total", "API requests seen since start, per route", "counter")
    for r, n in sorted(ops._hits.items()):
        out.append(f'apexfi_http_requests_total{{route="{_esc(r)}"}} {n}')
    head("apexfi_http_errors_total", "API requests that returned a 5xx error, per route", "counter")
    for r in sorted(ops._hits):
        out.append(f'apexfi_http_errors_total{{route="{_esc(r)}"}} {ops._err.get(r, 0)}')
    head("apexfi_http_latency_ms", "Response time in milliseconds over the last 500 requests per route", "gauge")
    for r, vals in sorted(ops._lat.items()):
        v = list(vals)
        if not v:
            continue
        for q, lab in ((0.5, "0.5"), (0.95, "0.95"), (0.99, "0.99")):
            out.append(f'apexfi_http_latency_ms{{route="{_esc(r)}",quantile="{lab}"}} {ops._pct(v, q)}')

    final, v1 = _model_scores()
    if final:
        head("apexfi_model_metric", "Saved test-set scores of the models (read from v2_summary.json)", "gauge")
        for model, d in (("v2", final), ("v1", v1)):
            for k in ("pr_auc", "roc_auc", "ks", "precision", "recall", "f1", "brier"):
                if d.get(k) is not None:
                    out.append(f'apexfi_model_metric{{model="{model}",metric="{k}"}} {d[k]}')
    return "\n".join(out) + "\n"
