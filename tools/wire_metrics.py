"""Adds the /metrics router to backend/main.py. Safe to run twice. Changes nothing else."""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(ROOT, "backend", "main.py")
raw = open(p, "rb").read().decode("utf-8")
crlf = "\r\n" in raw
t = raw.replace("\r\n", "\n")
if "routers import metrics" in t or "metrics.router" in t:
    print("already wired, nothing to do"); sys.exit(0)
lines = t.split("\n")
idx = max((i for i, l in enumerate(lines) if l.startswith("app.include_router(")), default=None)
if idx is None:
    raise SystemExit("backend/main.py looks different from expected. Send me the top 60 lines.")
lines[idx + 1:idx + 1] = ["from backend.routers import metrics  # noqa: E402", "app.include_router(metrics.router)   # /metrics for Prometheus and Grafana"]
out = "\n".join(lines)
open(p, "wb").write((out.replace("\n", "\r\n") if crlf else out).encode("utf-8"))
print("backend/main.py: added /metrics router")
