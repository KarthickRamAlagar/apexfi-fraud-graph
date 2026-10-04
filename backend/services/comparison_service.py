"""Runs BOTH IEEE-CIS models on the same input so the app can show a real,
side-by-side comparison:

  * Non-time-series  = the flagship stacked model (LightGBM + GraphSAGE, 446
                       features, RANDOM split).
  * Time-series      = the 7-feature LightGBM trained on a CHRONOLOGICAL split
                       with leak-free rolling-window features.

Nothing here is simulated: each number comes from the real predictor. If one
model is unavailable, that side is marked unavailable (with a generic message,
never an internal error string) and the other still returns.

NOTE: the two models differ in BOTH architecture/features and split strategy,
so their scores are not directly interchangeable -- the UI says so.
"""
import math
import threading
from datetime import datetime, timezone

from sqlalchemy import text

# Operating threshold finalised for the time-series model (see
# streamlit_app/data/threshold_optimization.json / quick_wins.json).
TEMPORAL_THRESHOLD = 0.6

NON_TS_LABEL = "Non-time-series (stacked LightGBM + GraphSAGE, random split)"
TS_LABEL = "Time-series (LightGBM, chronological split + rolling features)"

_split_lock = threading.Lock()
_split_cache = {}


def _clean(v):
    """None for NaN/None; ints for whole numbers; otherwise unchanged."""
    if v is None:
        return None
    try:
        if isinstance(v, float) and math.isnan(v):
            return None
    except TypeError:
        pass
    if hasattr(v, "__float__") and not isinstance(v, (int, float, str, bool)):
        v = float(v)  # Decimal
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def _get_engine():
    from backend.db import engine

    return engine


def temporal_split_info():
    """Where the chronological 75/25 split falls (transactiondt). Cached."""
    with _split_lock:
        if "split_dt" in _split_cache:
            return dict(_split_cache)
        with _get_engine().connect() as conn:
            row = conn.execute(
                text(
                    "SELECT percentile_disc(0.75) WITHIN GROUP (ORDER BY transactiondt) AS split_dt, "
                    "MIN(transactiondt) AS min_dt, MAX(transactiondt) AS max_dt "
                    "FROM gold.ieee_cis_features"
                )
            ).fetchone()
        _split_cache.update(split_dt=row.split_dt, min_dt=row.min_dt, max_dt=row.max_dt)
        return dict(_split_cache)


def _safe_model_result(label, fn, extra=None):
    try:
        result = fn()
        if result is None:
            return {"label": label, "available": False,
                    "message": "This model has no prediction for this input."}
        out = {"label": label, "available": True, **result}
        if extra:
            out.update(extra)
        return out
    except Exception as e:  # never leak internals to the client
        print(f"[compare] {label} failed: {type(e).__name__}: {e}")
        return {"label": label, "available": False,
                "message": "This model is temporarily unavailable."}


def _agreement(a, b):
    if not (a.get("available") and b.get("available")):
        return {"comparable": False, "note": "Only one model returned a result, so no comparison is possible."}
    agree = bool(a["isFlagged"]) == bool(b["isFlagged"])
    gap = round(abs(a["riskScore"] - b["riskScore"]), 4)
    if agree:
        verdict = "FLAGGED" if a["isFlagged"] else "CLEAR"
        note = f"Both models agree: {verdict}."
    else:
        flagged = "non-time-series" if a["isFlagged"] else "time-series"
        note = (f"The models disagree: only the {flagged} model flags this transaction. "
                "That is expected sometimes -- they use different features, thresholds and training splits.")
    return {"comparable": True, "agree": agree, "scoreGap": gap, "note": note}


def _temporal_input_from(values):
    return {
        "card1": _clean(values.get("card1")),
        "card2": _clean(values.get("card2")),
        "addr1": _clean(values.get("addr1")),
        "p_emaildomain": _clean(values.get("p_emaildomain")),
        "deviceinfo": _clean(values.get("deviceinfo")),
        "transactiondt": _clean(values.get("transactiondt")),
    }


def compare_existing(transaction_id: int):
    """Investigate path: a transaction already in the dataset."""
    from backend.services.fraud_predictor import get_predictor
    from backend.services.temporal_predictor_service import get_temporal_predictor

    with _get_engine().connect() as conn:
        row = conn.execute(
            text(
                "SELECT transactionid, transactionamt, productcd, card1, card2, addr1, p_emaildomain, "
                "deviceinfo, transactiondt, transaction_date, is_fraud "
                "FROM gold.ieee_cis_features WHERE transactionid = :id"
            ),
            {"id": transaction_id},
        ).fetchone()
    if row is None:
        return None

    non_ts = _safe_model_result(NON_TS_LABEL, lambda: get_predictor().predict(transaction_id))
    t_input = _temporal_input_from(row._mapping)
    ts = _safe_model_result(
        TS_LABEL,
        lambda: get_temporal_predictor().predict(t_input, threshold=TEMPORAL_THRESHOLD),
        extra={"thresholdNote": f"Operating threshold {TEMPORAL_THRESHOLD} (finalised from the threshold sweep)."},
    )

    window = None
    try:
        info = temporal_split_info()
        in_train = row.transactiondt is not None and row.transactiondt <= info["split_dt"]
        window = {
            "inTimeSeriesTrainingWindow": bool(in_train),
            "note": (
                "This transaction falls in the EARLIEST 75% of the timeline, which the time-series model was "
                "trained on -- so its score here is not an out-of-sample test."
                if in_train else
                "This transaction falls in the MOST RECENT 25% of the timeline, which the time-series model "
                "never saw during training -- a genuine out-of-sample score."
            ),
        }
    except Exception as e:
        print(f"[compare] split info failed: {e}")

    return {
        "kind": "investigate",
        "input": {
            "transactionId": f"TX-{row.transactionid}",
            "amount": float(row.transactionamt) if row.transactionamt is not None else None,
            "productCode": row.productcd,
            "card1": _clean(row.card1),
            "device": row.deviceinfo or "unknown",
            "date": str(row.transaction_date)[:10] if row.transaction_date else None,
            "historicalLabel": "Fraud" if row.is_fraud else "Normal",
        },
        "models": {"nonTimeSeries": non_ts, "timeSeries": ts},
        "agreement": _agreement(non_ts, ts),
        "window": window,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def compare_new(payload: dict):
    """Score New path: a transaction that is NOT in the dataset."""
    from backend.services.new_transaction_predictor_service import get_new_transaction_predictor
    from backend.services.temporal_predictor_service import get_temporal_predictor

    non_ts = _safe_model_result(NON_TS_LABEL, lambda: get_new_transaction_predictor().predict(dict(payload)))
    t_input = _temporal_input_from(payload)  # no transactiondt -> "as of the dataset's current now"
    ts = _safe_model_result(
        TS_LABEL,
        lambda: get_temporal_predictor().predict(t_input, threshold=TEMPORAL_THRESHOLD),
        extra={"thresholdNote": f"Operating threshold {TEMPORAL_THRESHOLD} (finalised from the threshold sweep)."},
    )
    return {
        "kind": "new",
        "input": {
            "amount": payload.get("transactionamt"),
            "productCode": payload.get("productcd"),
            "card1": _clean(payload.get("card1")),
            "card2": _clean(payload.get("card2")),
            "addr1": _clean(payload.get("addr1")),
            "emailDomain": payload.get("p_emaildomain"),
            "device": payload.get("deviceinfo") or "not provided",
        },
        "models": {"nonTimeSeries": non_ts, "timeSeries": ts},
        "agreement": _agreement(non_ts, ts),
        "window": {
            "inTimeSeriesTrainingWindow": None,
            "note": ("New input: neither model has seen this transaction. The time-series model scores it as of "
                     "the dataset's own latest timestamp, using real rolling-window history for the card/device."),
        },
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
