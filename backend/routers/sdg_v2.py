"""SDG Lab (V2): two honest paths to the same arithmetic.
  Tab 1  /api/sdg/manual          -> user types the numbers (a calculator).
  Tab 2  /api/sdg/engine/*        -> numbers come from the fraud ENGINE: real held-out transactions scored by the V2 model,
                                     decisions (fraud / not fraud) are passed as a payload and the money, workload and
                                     uncertainty are computed from those real amounts. Scale-ups are tagged SCENARIO."""
import math
import os
from typing import List, Optional

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.services.sdg_engine import Assumptions, evaluate

router = APIRouter(prefix="/api/sdg", tags=["sdg-v2"])
PROBS = "app_data/v2_final_probs.npz"
_cache = {}


def _clean(o):
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if (math.isinf(o) or math.isnan(o)) else float(o)
    if isinstance(o, np.integer):
        return int(o)
    return o


def _probs():
    if "p" not in _cache:
        if not os.path.exists(PROBS):
            raise HTTPException(404, "V2 engine scores not found: run v2_final.py and copy final_probs.npz to app_data/v2_final_probs.npz")
        z = np.load(PROBS)
        _cache["p"] = dict(score=z["final_test"], y=z["y_test"], amount=z["amount_test"])
    return _cache["p"]


class Assump(BaseModel):
    prevention_rate: float = Field(0.90, ge=0, le=1)
    loss_given_miss: float = Field(1.0, ge=0, le=1)
    review_cost: float = Field(2.0, ge=0)
    friction_cost: float = Field(5.0, ge=0)
    minutes_per_review: float = Field(5.0, gt=0)
    analysts: int = Field(20, ge=1, le=1_000_000)
    scale_to_daily: Optional[float] = Field(None, gt=0)


class ManualIn(Assump):
    transactions_per_day: float = Field(1_000_000, gt=0)
    fraud_rate_pct: float = Field(3.45, ge=0, le=100)
    avg_fraud_amount: float = Field(135.03, ge=0)
    recall_pct: float = Field(43.4, ge=0, le=100)
    false_positive_rate_pct: float = Field(0.95, ge=0, le=100)


@router.post("/manual")
def manual(b: ManualIn):
    n = b.transactions_per_day
    fr = n * b.fraud_rate_pct / 100
    tp = fr * b.recall_pct / 100
    fn = fr - tp
    honest = n - fr
    fp = honest * b.false_positive_rate_pct / 100
    flagged = tp + fp
    stopped = tp * b.avg_fraud_amount * b.prevention_rate
    leaked = fn * b.avg_fraud_amount * b.loss_given_miss + tp * b.avg_fraud_amount * (1 - b.prevention_rate)
    cost = flagged * b.review_cost + fp * b.friction_cost
    hours = flagged * b.minutes_per_review / 60
    return _clean(dict(mode="manual", tag="SCENARIO (every number typed by the user)", frauds_per_day=fr, caught=tp, missed=fn, false_alarms=fp, flagged=flagged,
                       value_stopped=stopped, value_leaked=leaked, operating_cost=cost, net_benefit=stopped - cost, analyst_hours_per_day=hours,
                       honest_blocked_per_10k=1e4 * b.false_positive_rate_pct / 100))


@router.get("/engine/meta")
def meta():
    p = _probs()
    return dict(rows=int(len(p["y"])), frauds=int(p["y"].sum()), source="V2 production LightGBM (tuned), scored on the held-out, time-ordered test block (never used for fitting or tuning)",
                default_threshold=0.21, threshold_rule="F1-optimal on the validation block")


class ReplayIn(Assump):
    start: int = Field(0, ge=0)
    n: int = Field(20000, ge=100, le=147_635)
    threshold: float = Field(0.21, ge=0.001, le=0.999)


@router.post("/engine/replay")
def replay(b: ReplayIn):
    p = _probs()
    s = slice(b.start, min(b.start + b.n, len(p["y"])))
    A = Assumptions(**b.model_dump(include={"prevention_rate", "loss_given_miss", "review_cost", "friction_cost", "minutes_per_review", "analysts", "scale_to_daily"}))
    out = evaluate(p["amount"][s], p["score"][s], b.threshold, p["y"][s], A, n_mc=1000, window_hours=None if A.scale_to_daily else None)
    prev = [dict(amount=float(a), score=round(float(c), 4), decision="FRAUD" if c >= b.threshold else "not fraud", actual="fraud" if y else "honest")
            for a, c, y in zip(p["amount"][s][:8], p["score"][s][:8], p["y"][s][:8])]
    return _clean(dict(mode="engine-replay", window=dict(start=s.start, stop=s.stop), payload_preview=prev, result=out))


class Txn(BaseModel):
    amount: float = Field(ge=0)
    score: float = Field(ge=0, le=1)
    label: Optional[int] = Field(None, ge=0, le=1)


class PayloadIn(Assump):
    transactions: List[Txn] = Field(min_length=10, max_length=200_000)
    threshold: float = Field(0.21, ge=0.001, le=0.999)


@router.post("/engine/payload")
def payload(b: PayloadIn):
    amt = np.array([t.amount for t in b.transactions])
    sc = np.array([t.score for t in b.transactions])
    has = all(t.label is not None for t in b.transactions)
    y = np.array([t.label for t in b.transactions]) if has else None
    A = Assumptions(**b.model_dump(include={"prevention_rate", "loss_given_miss", "review_cost", "friction_cost", "minutes_per_review", "analysts", "scale_to_daily"}))
    return _clean(dict(mode="engine-payload", labels_supplied=has, result=evaluate(amt, sc, b.threshold, y, A, n_mc=500)))
