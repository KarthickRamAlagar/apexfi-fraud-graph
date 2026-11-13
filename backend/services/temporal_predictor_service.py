"""Singleton predictor for the temporal-validated IEEE-CIS model --
serves the REAL, honest chronological-split model (not the optimistic
random-split one), including its real rolling-window features."""
import pickle

import lightgbm as lgb
import numpy as np
import pandas as pd
import shap
from sqlalchemy import text

from etl.db.connection import get_engine

CHECKPOINT_DIR = "ml/checkpoints"
_predictor = None


class TemporalPredictor:
    def __init__(self):
        print("Loading real temporal-validated IEEE-CIS model...")
        self.model = lgb.Booster(model_file=f"{CHECKPOINT_DIR}/ieee_cis_temporal_lightgbm.txt")
        with open(f"{CHECKPOINT_DIR}/ieee_cis_temporal_artifacts.pkl", "rb") as f:
            artifacts = pickle.load(f)
        self.freq_maps = artifacts["freq_maps"]
        self.feature_cols = artifacts["feature_cols"]
        self.freq_cols = artifacts["freq_cols"]
        self.rolling_cols = artifacts["rolling_cols"]
        self.explainer = shap.TreeExplainer(self.model)
        self.engine = get_engine()
        print(f"  Ready. Real chronological-split model, {len(self.feature_cols)} features.")

    def _real_rolling_features(self, card1, deviceinfo, as_of_dt):
        """Real, live rolling-window lookup: counts/sums real EXISTING
        transactions for this card/device in the hour strictly BEFORE
        as_of_dt -- same leak-free logic validated in training, applied
        live for a genuinely new transaction."""
        with self.engine.connect() as conn:
            card_stats = conn.execute(
                text(
                    """
                    SELECT COUNT(*) AS cnt, COALESCE(SUM(transactionamt), 0) AS total
                    FROM gold.ieee_cis_features
                    WHERE card1 = :card1
                      AND transactiondt < :as_of_dt
                      AND transactiondt >= :as_of_dt - 3600
                    """
                ),
                {"card1": card1, "as_of_dt": as_of_dt},
            ).fetchone()
            device_stats = conn.execute(
                text(
                    """
                    SELECT COUNT(*) AS cnt
                    FROM gold.ieee_cis_features
                    WHERE deviceinfo = :deviceinfo
                      AND transactiondt < :as_of_dt
                      AND transactiondt >= :as_of_dt - 3600
                    """
                ),
                {"deviceinfo": deviceinfo, "as_of_dt": as_of_dt},
            ).fetchone()
        return {
            "card1_txn_count_1h": float(card_stats.cnt or 0),
            "card1_amount_sum_1h": float(card_stats.total or 0),
            "device_txn_count_1h": float(device_stats.cnt or 0),
        }

    def predict(self, raw_input: dict, threshold: float = 0.5):
        card1 = raw_input.get("card1")
        deviceinfo = raw_input.get("deviceinfo")

        # "As of when" -- defaults to the real, live maximum transactiondt
        # in the data (the dataset's own genuine "now"), mirroring exactly
        # how Score New Transaction treats a genuinely new transaction
        # elsewhere in this project. THIS is the fix that was missing --
        # without it, as_of_dt always stayed None (the frontend never
        # sends it), which silently forced all three rolling features to
        # 0.0 via the fallback below, regardless of real data.
        as_of_dt = raw_input.get("transactiondt")
        if as_of_dt is None:
            with self.engine.connect() as conn:
                as_of_dt = conn.execute(text("SELECT MAX(transactiondt) FROM gold.ieee_cis_features")).scalar()

        row = {}
        for col in self.freq_cols:
            val = raw_input.get(col)
            freq_map = self.freq_maps.get(col, {})
            row[f"{col}_freq"] = float(freq_map.get(val, 0)) if val is not None else 0.0

        rolling = self._real_rolling_features(card1, deviceinfo, as_of_dt) if as_of_dt is not None else {c: 0.0 for c in self.rolling_cols}
        row.update(rolling)

        X = pd.DataFrame([row])[self.feature_cols].fillna(0)
        prob = float(self.model.predict(X)[0])

        shap_values = self.explainer.shap_values(X)
        if isinstance(shap_values, list):
            shap_values = shap_values[-1]
        values = np.array(shap_values).reshape(-1)
        order = np.argsort(-np.abs(values))[:5]
        top_features = [
            {"feature": self.feature_cols[i], "value": round(float(X.iloc[0, i]), 4), "contribution": round(float(values[i]), 4)}
            for i in order
        ]

        return {
            "riskScore": round(prob, 4),
            "isFlagged": prob >= threshold,
            "threshold": threshold,
            "realRollingFeatures": rolling,
            "topContributingFeatures": top_features,
            "modelInfo": {
                "type": "LightGBM, chronological (temporal) split -- genuine forward-time validated",
                "note": (
                    "This model was trained and validated using a real chronological split "
                    "(train on the earliest 75%, test on the most recent 25%), not a random "
                    "split -- a more honest reflection of real-world deployment, where you "
                    "only ever have past data to predict the future."
                ),
            },
        }


def get_temporal_predictor():
    global _predictor
    if _predictor is None:
        _predictor = TemporalPredictor()
    return _predictor