"""Singleton wrapper around ml.inference.FraudPredictor — loads the graph
and all three models ONCE, on first use, and reuses that in-memory state
across every API request. Reloading ~1GB+ of graph/model data on every
single request would be slow and, given this machine's memory history,
genuinely risky.

Note: this holds a real, meaningful chunk of memory in the backend
process for as long as it runs (the graph itself is large). Worth keeping
in mind if memory becomes tight again — a lighter on-demand-reload
approach exists as a fallback if needed, trading latency for memory.
"""
from ml.inference import FraudPredictor

_predictor = None


def get_predictor():
    global _predictor
    if _predictor is None:
        _predictor = FraudPredictor()
    return _predictor