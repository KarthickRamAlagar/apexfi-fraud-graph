"""V2 evaluation API. Everything here is read from saved result files made by the V2 pipeline (no number is typed by hand).
  GET /api/v2/summary            all V2 tables (benchmark, tuning, finance metrics, DGraph-Fin correction ...)
  GET /api/v2/score/{tid}        V1 vs V2 score for one held-out transaction (test block only), with the true label
  GET /api/v2/examples           a few real held-out examples: caught frauds, missed frauds, false alarms
Scores exist only for the 147,635 held-out transactions the models never saw in training."""
import json
import os

import numpy as np
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/v2", tags=["v2-eval"])
DATA = os.path.join(os.path.dirname(__file__), "..", "..", "app_data")
_c = {}


def _summary():
    if "s" not in _c:
        p = os.path.join(DATA, "v2_summary.json")
        if not os.path.exists(p):
            raise HTTPException(404, "v2_summary.json not found in app_data")
        _c["s"] = json.load(open(p, encoding="utf-8"))
    return _c["s"]


def _scores():
    if "z" not in _c:
        p = os.path.join(DATA, "v2_test_scores.npz")
        if not os.path.exists(p):
            raise HTTPException(404, "v2_test_scores.npz not found in app_data")
        z = np.load(p)
        d = {k: z[k] for k in ("tid", "dt", "v2", "v1", "y", "amount")}
        d["t2"] = float(z["threshold_v2"]); d["t1"] = float(z["threshold_v1"])
        d["pos"] = {int(t): i for i, t in enumerate(d["tid"])}
        # risk rank: 1 = riskiest of the 147,635 held-out transactions
        d["rank2"] = (np.argsort(np.argsort(-d["v2"])) + 1)
        _c["z"] = d
    return _c["z"]


def _row(i, d):
    v2, v1, y = float(d["v2"][i]), float(d["v1"][i]), int(d["y"][i])
    f2, f1 = v2 >= d["t2"], v1 >= d["t1"]
    def verdict(flag):
        if flag and y: return "caught fraud (correct)"
        if flag and not y: return "false alarm (honest customer flagged)"
        if (not flag) and y: return "missed fraud (wrong)"
        return "passed as normal (correct)"
    return dict(
        transaction_id=int(d["tid"][i]), amount=round(float(d["amount"][i]), 2), true_label="fraud" if y else "not fraud",
        v2=dict(score=round(v2, 5), threshold=d["t2"], decision="FRAUD" if f2 else "NOT FRAUD", outcome=verdict(f2), risk_rank=int(d["rank2"][i]), of=len(d["tid"])),
        v1=dict(score=round(v1, 5), threshold=d["t1"], decision="FRAUD" if f1 else "NOT FRAUD", outcome=verdict(f1)),
        note="Held-out test transaction: the model was never trained or tuned on it. Score is precomputed by the V2 pipeline.")


@router.get("/summary")
def summary():
    return _summary()


@router.get("/score/{tid}")
def score(tid: int):
    d = _scores()
    i = d["pos"].get(int(tid))
    if i is None:
        raise HTTPException(404, f"Transaction {tid} is not in the held-out test block (ids {int(d['tid'].min())}-{int(d['tid'].max())}). V2 scores exist only for held-out transactions, so no score is ever shown for data the model trained on.")
    return _row(i, d)


@router.get("/examples")
def examples(n: int = 4):
    d = _scores(); n = max(1, min(n, 10)); rng = np.random.RandomState(7)
    f2 = d["v2"] >= d["t2"]; y = d["y"] == 1
    groups = {"caught_frauds": f2 & y, "missed_frauds": (~f2) & y, "false_alarms": f2 & (~y), "passed_normal": (~f2) & (~y)}
    out = {}
    for k, m in groups.items():
        idx = np.where(m)[0]
        pick = rng.choice(idx, min(n, len(idx)), replace=False) if len(idx) else []
        out[k] = [_row(int(i), d) for i in pick]
    out["counts"] = {k: int(m.sum()) for k, m in groups.items()}
    return out
