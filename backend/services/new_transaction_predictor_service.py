"""Singleton wrapper — loads the full new-transaction pipeline (LightGBM
+ GNN + stacking + SHAP) ONCE, on first use, same pattern as
fraud_predictor.py. This is a SEPARATE instance from Investigate's
FraudPredictor (different inference path — new/unseen vs. retrospective
lookup), so both get loaded independently if both features are used in
the same running backend process.
"""
from ml.new_transaction_predictor import NewTransactionPredictor

_predictor = None


def get_new_transaction_predictor():
    global _predictor
    if _predictor is None:
        _predictor = NewTransactionPredictor()
    return _predictor