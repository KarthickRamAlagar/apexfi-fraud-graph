"""Items #1, #2, #10, #12 -- batched together since all four reuse the
already-loaded temporal model and are genuinely fast:
  #1  Finalized operating threshold (0.6, with real justification)
  #2  Feature importance (LightGBM native, gain-based)
  #10 Memory recheck (clean re-run, since the prior reading looked like
      a garbage-collection artifact)
  #12 P99 latency (added alongside existing P95)
"""
import json
import time

import numpy as np
import psutil
from backend.services.temporal_predictor_service import get_temporal_predictor

predictor = get_temporal_predictor()

# ---- #1: Finalized operating threshold ----
FINAL_THRESHOLD = 0.6
threshold_justification = (
    "Threshold 0.6 chosen as the recommended operating point over the naive default "
    "(0.5) and the mathematically-best-F1 threshold (0.7). At 0.6: F1=0.2343 (better "
    "than default's 0.1970), Precision=0.1525 (better than default's 0.1176), and "
    "FPR=0.1003 (better than default's 0.1624) -- a real improvement on every one of "
    "these simultaneously. Threshold 0.7, despite a marginally higher F1 (0.2601), "
    "was rejected as the primary recommendation because its Recall drops to 39.65% "
    "(FNR 60.35%) -- missing over 60% of real fraud is a worse trade-off for a fraud-"
    "detection system than 0.6's 50.47% recall (FNR 49.53%). This is a deliberate "
    "business-policy choice, not simply the highest F1 value."
)
print(f"#1: Finalized threshold = {FINAL_THRESHOLD}")
print(f"    {threshold_justification[:100]}...")

# ---- #2: Real feature importance (LightGBM native, gain-based) ----
importance = predictor.model.feature_importance(importance_type="gain")
feature_importance = sorted(
    zip(predictor.feature_cols, importance.tolist()), key=lambda x: -x[1]
)
print("\n#2: Real feature importance (gain-based):")
for feat, imp in feature_importance:
    print(f"    {feat}: {imp:.2f}")

# ---- #10: Memory recheck (clean, no GC surprises) ----
sample_input = {"card1": 9500, "card2": 360, "addr1": 441, "p_emaildomain": "gmail.com", "deviceinfo": "KFFOWI Build/LVY48F"}
process = psutil.Process()

predictor.predict(sample_input)  # warm-up
import gc
gc.collect()  # force a clean baseline, so we're not measuring a GC pause by accident
mem_before = process.memory_info().rss / 1024 / 1024

for _ in range(20):
    predictor.predict(sample_input)

mem_after = process.memory_info().rss / 1024 / 1024
print(f"\n#10: Memory recheck (clean, GC-controlled): {mem_before:.2f} MB -> {mem_after:.2f} MB "
      f"(delta: {mem_after - mem_before:+.2f} MB over 20 real predictions)")

# ---- #12: P99 latency (alongside existing P95) ----
times = []
for _ in range(100):
    start = time.perf_counter()
    predictor.predict(sample_input)
    times.append((time.perf_counter() - start) * 1000)

p95 = float(np.percentile(times, 95))
p99 = float(np.percentile(times, 99))
print(f"\n#12: Real P95 latency: {p95:.2f} ms")
print(f"     Real P99 latency: {p99:.2f} ms")

# ---- save everything ----
output = {
    "finalized_threshold": {
        "value": FINAL_THRESHOLD,
        "justification": threshold_justification,
    },
    "feature_importance_gain": [{"feature": f, "importance": round(i, 2)} for f, i in feature_importance],
    "memory_recheck_mb": {"before": round(mem_before, 2), "after": round(mem_after, 2), "delta": round(mem_after - mem_before, 2)},
    "latency_percentiles_ms": {"p95": round(p95, 2), "p99": round(p99, 2)},
}
with open("streamlit_app/data/quick_wins.json", "w") as f:
    json.dump(output, f, indent=2)
print("\nSaved: streamlit_app/data/quick_wins.json")