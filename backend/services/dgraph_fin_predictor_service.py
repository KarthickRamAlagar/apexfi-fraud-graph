"""Singleton wrapper — loads the DGraph-Fin graph and all three models
ONCE, on first use, same pattern as fraud_predictor.py for IEEE-CIS.
Separate instance/memory footprint from IEEE-CIS's predictors.
"""
from ml.dgraph_fin_inference import DGraphFinPredictor

_predictor = None


def get_dgraph_fin_predictor():
    global _predictor
    if _predictor is None:
        _predictor = DGraphFinPredictor()
    return _predictor