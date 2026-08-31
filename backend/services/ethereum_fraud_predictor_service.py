"""Singleton predictor for the Ethereum fraud experiment -- separate,
independent instance from the UPI/IMPS predictors, matching the same
lazy-load-once pattern used elsewhere in the project."""
import pickle

import lightgbm as lgb
import numpy as np
import pandas as pd
import shap

CHECKPOINT_DIR = "ml/checkpoints"
RAW_PATH = "data/raw_downloads/ethereum_fraud.csv"

_predictor = None


class EthereumFraudPredictor:
    def __init__(self):
        print("Loading Ethereum fraud model (real, third experiment)...")
        self.model = lgb.Booster(model_file=f"{CHECKPOINT_DIR}/ethereum_fraud_lightgbm.txt")
        with open(f"{CHECKPOINT_DIR}/ethereum_fraud_cat_maps.pkl", "rb") as f:
            saved = pickle.load(f)
        self.cat_maps = saved["cat_maps"]
        self.feature_cols = saved["feature_cols"]
        self.explainer = shap.TreeExplainer(self.model)

        # real accounts, kept in memory for lookup by address
        df = pd.read_csv(RAW_PATH)
        df.columns = [c.strip() if c.strip() not in self.cat_maps else c for c in df.columns]
        self.df = df.set_index("Address", drop=False)
        print(f"  Ready. {len(self.df):,} real Ethereum accounts indexed.")

    def _build_features(self, row):
        row = row.copy()
        for col, mapping in self.cat_maps.items():
            val = row.get(col, "missing")
            val = "missing" if pd.isna(val) else str(val)
            row[f"{col}_enc"] = mapping.get(val, mapping["__unknown__"])
        return pd.DataFrame([row])[self.feature_cols].fillna(0)

    def sample_addresses(self, n=8):
        sample = self.df.sample(n=n, random_state=None)
        return [{"address": a, "isFlagged": bool(f)} for a, f in zip(sample["Address"], sample["FLAG"])]

    def search(self, query, limit=8):
        matches = self.df[self.df["Address"].str.contains(query, case=False, na=False)].head(limit)
        return [{"address": a, "isFlagged": bool(f)} for a, f in zip(matches["Address"], matches["FLAG"])]

    def predict(self, address, threshold=0.5):
        if address not in self.df.index:
            return None
        row = self.df.loc[address]
        X = self._build_features(row)

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
            "address": address,
            "realLabel": bool(row["FLAG"]),
            "riskScore": round(prob, 4),
            "isFlagged": prob >= threshold,
            "threshold": threshold,
            "topContributingFeatures": top_features,
            "modelInfo": {
                "type": "LightGBM (explainable, real Ethereum blockchain accounts)",
                "note": (
                    "Third, independent validation of ApexFi's real explainable fraud-detection "
                    "methodology on a structurally different domain (blockchain accounts, not UPI "
                    "transactions or DGraph-Fin's account network) -- not merged into the main "
                    "pipeline; blockchain and UPI have no genuine shared identity."
                ),
            },
        }


def get_ethereum_fraud_predictor():
    global _predictor
    if _predictor is None:
        _predictor = EthereumFraudPredictor()
    return _predictor