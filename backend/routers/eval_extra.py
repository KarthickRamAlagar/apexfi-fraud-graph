"""Extra evaluation views, all computed from real saved files (nothing typed by hand).

  GET /api/eval/curves          ROC, precision-recall, confusion matrix, calibration, lift/gain, KS, score histogram, threshold sweep
                                for V1 and V2, from the untouched test block scores (v2_test_scores.npz, 147,635 rows)
  GET /api/eval/feature-groups  grouped feature study (v2_feature_groups.json, made by ml/v2_feature_groups.py)
  GET /api/eval/bayes-net       Bayesian network side model (v2_bayes_net.json, made by ml/v2_bayes_net.py)
"""
import json
import os

import numpy as np
from fastapi import APIRouter, HTTPException

from backend.services.app_paths import data_path

router = APIRouter(prefix="/api/eval", tags=["evaluation"])
_cache: dict = {}


def _need(name: str, hint: str):
    p = data_path(name)
    if not os.path.exists(p):
        raise HTTPException(404, f"{name} not found. {hint}")
    return p


def _r(x, d=5):
    return [round(float(v), d) for v in x]


def _curves_for(y: np.ndarray, s: np.ndarray, thr: float) -> dict:
    n = len(y)
    P = int(y.sum())
    N = n - P
    order = np.argsort(-s, kind="stable")
    ys = y[order]
    tps = np.cumsum(ys)
    fps = np.cumsum(1 - ys)
    # points to keep: spread evenly AND dense at the top of the ranking (where fraud sits)
    idx = np.unique(np.concatenate([np.linspace(0, n - 1, 260).astype(int), np.geomspace(1, n, 160).astype(int) - 1]))
    tpr, fpr = tps[idx] / P, fps[idx] / N
    prec = tps[idx] / (tps[idx] + fps[idx])
    # areas by trapezoid / step sum on the FULL curve (same numbers as sklearn)
    xr, yr = np.concatenate([[0], fps / N]), np.concatenate([[0], tps / P])
    roc_auc = float(np.sum(np.diff(xr) * (yr[1:] + yr[:-1]) / 2))   # trapezoid area (works on every numpy version)
    pr_all = tps / (tps + fps)
    ap = float(np.sum(np.diff(np.concatenate([[0], tps / P])) * pr_all))
    # confusion at the model's operating threshold
    pred = s >= thr
    tp = int((pred & (y == 1)).sum()); fp = int((pred & (y == 0)).sum()); fn = int((~pred & (y == 1)).sum()); tn = int((~pred & (y == 0)).sum())
    # calibration: 10 equal-count bins by score
    qs = np.quantile(s, np.linspace(0, 1, 11)); qs[-1] += 1e-9
    b = np.clip(np.searchsorted(qs, s, side="right") - 1, 0, 9)
    cal = [{"bin": int(k), "mean_pred": float(s[b == k].mean()), "observed": float(y[b == k].mean()), "rows": int((b == k).sum())} for k in range(10) if (b == k).any()]
    # lift / gain: share of all fraud caught when you review the top x% of transactions
    xs = np.array([0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0])
    gain = [{"top_pct": float(x * 100), "recall": float(tps[max(int(x * n) - 1, 0)] / P), "lift": float(tps[max(int(x * n) - 1, 0)] / P / x)} for x in xs]
    # KS curve = max gap between caught-fraud rate and false-alarm rate as the cut-off moves
    ks_gap = tpr - fpr
    k_i = int(np.argmax(tps / P - fps / N))
    # score histogram by class (20 bins, 0..1)
    edges = np.linspace(0, 1, 21)
    h_f, _ = np.histogram(s[y == 1], bins=edges)
    h_n, _ = np.histogram(s[y == 0], bins=edges)
    # threshold sweep
    ths = np.unique(np.round(np.concatenate([np.linspace(0.02, 0.98, 25), [thr]]), 4))
    sweep = []
    for t in ths:
        pr_ = s >= t
        a = int((pr_ & (y == 1)).sum()); c = int(pr_.sum())
        pre = a / c if c else 0.0
        rec = a / P
        sweep.append({"threshold": float(t), "precision": pre, "recall": rec, "f1": (2 * pre * rec / (pre + rec)) if pre + rec else 0.0, "alert_rate_pct": c / n * 100})
    return {
        "threshold": float(thr), "rows": n, "frauds": P,
        "roc": {"fpr": _r(fpr), "tpr": _r(tpr), "auc": roc_auc},
        "pr": {"recall": _r(tps[idx] / P), "precision": _r(prec), "ap": ap, "base_rate": P / n},
        "confusion": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
        "calibration": cal, "gain": gain,
        "ks": {"value": float((tps[k_i] / P) - (fps[k_i] / N)), "at_score": float(s[order][k_i]), "tpr": float(tps[k_i] / P), "fpr": float(fps[k_i] / N)},
        "score_hist": {"edges": _r(edges, 2), "fraud": [int(v) for v in h_f], "normal": [int(v) for v in h_n]},
        "sweep": sweep,
    }


@router.get("/curves")
def curves():
    if "curves" not in _cache:
        z = np.load(_need("v2_test_scores.npz", "Run the V2 final scoring step and copy v2_test_scores.npz into app_data/."))
        y = z["y"].astype(int)
        _cache["curves"] = {
            "source": "Untouched test block: the last 25% of IEEE-CIS transactions in time order.",
            "v2": _curves_for(y, z["v2"].astype(float), float(z["threshold_v2"])),
            "v1": _curves_for(y, z["v1"].astype(float), float(z["threshold_v1"])),
        }
    return _cache["curves"]


@router.get("/feature-groups")
def feature_groups():
    p = _need("v2_feature_groups.json", "Run: uv run python ml/v2_feature_groups.py")
    with open(p, encoding="utf-8") as f:
        return json.load(f)


@router.get("/bayes-net")
def bayes_net():
    p = _need("v2_bayes_net.json", "Run: uv run python ml/v2_bayes_net.py")
    with open(p, encoding="utf-8") as f:
        return json.load(f)
