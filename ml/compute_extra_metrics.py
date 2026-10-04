"""Real, additional metrics -- no new pipeline needed. Accuracy, FPR, and
FNR are simple math derived from the SAME confusion matrix that already
produced Precision/Recall/F1. Latency and memory are a real, direct
benchmark of the already-trained, already-saved model.

Memory now uses psutil (real OS-level process RSS) instead of
tracemalloc -- tracemalloc only sees pure Python allocations and is
blind to memory used by C-extension code (LightGBM, SHAP's actual
computation happens there), which produced a meaningless 0.01 MB result
in the first version of this script.
"""
import json
import time

import numpy as np
import pandas as pd
import psutil
from sklearn.metrics import confusion_matrix
from sklearn.model_selection import train_test_split
from sqlalchemy import text

from etl.db.connection import get_engine
from backend.services.temporal_predictor_service import get_temporal_predictor
from ml.build_rolling_features import load_real_sorted_data, build_rolling_features

RANDOM_SEED = 42
engine = get_engine()
FREQ_COLS = ["card1", "card2", "addr1", "p_emaildomain"]
ROLLING_COLS = ["card1_txn_count_1h", "card1_amount_sum_1h", "device_txn_count_1h"]


def compute_freq_maps(train_df):
    maps = {}
    for col in FREQ_COLS:
        if col in train_df.columns:
            maps[col] = np.log1p(train_df[col].value_counts())
    return maps


def apply_freq_maps(df, maps):
    df = df.copy()
    for col, freq_map in maps.items():
        df[f"{col}_freq"] = df[col].map(freq_map).fillna(0)
    return df


def main():
    # ============================================================
    # PART 1: Accuracy, FPR, FNR -- real math, same confusion matrix
    # underlying the Precision/Recall/F1 we already reported
    # ============================================================
    print("Reloading the real, already-trained temporal model + real test set...")
    predictor = get_temporal_predictor()

    with engine.connect() as conn:
        extra = pd.read_sql(
            text("SELECT transactionid, card2, addr1, p_emaildomain FROM gold.ieee_cis_features"),
            conn,
        )
    df = load_real_sorted_data()
    df = build_rolling_features(df)
    df = df.merge(extra, on="transactionid", how="left")
    df_sorted = df.sort_values("transactiondt").reset_index(drop=True)
    n = len(df_sorted)
    train_end = int(n * 0.75)
    train_c = df_sorted.iloc[:train_end]
    test_c = df_sorted.iloc[train_end:]

    freq_maps = compute_freq_maps(train_c)
    test_c = apply_freq_maps(test_c, freq_maps)
    feat_cols = [f"{c}_freq" for c in FREQ_COLS] + ROLLING_COLS
    X_test, y_test = test_c[feat_cols].fillna(0), test_c["is_fraud"]

    y_prob = predictor.model.predict(X_test)
    y_pred = (y_prob >= 0.5).astype(int)

    tn, fp, fn, tp = confusion_matrix(y_test, y_pred).ravel()
    accuracy = (tp + tn) / (tp + tn + fp + fn)
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0
    fnr = fn / (fn + tp) if (fn + tp) > 0 else 0

    print(f"\nReal confusion matrix: TP={tp} TN={tn} FP={fp} FN={fn}")
    print(f"Real Accuracy: {accuracy:.4f}")
    print(f"Real False Positive Rate: {fpr:.4f}")
    print(f"Real False Negative Rate: {fnr:.4f}")

    # ============================================================
    # PART 2: real inference latency (full live endpoint, including its
    # real database calls) + real memory (psutil, OS-level, correct)
    # ============================================================
    print("\nBenchmarking real inference latency (100 real predictions, full live endpoint)...")
    sample_input = {"card1": 9500, "card2": 360, "addr1": 441, "p_emaildomain": "gmail.com", "deviceinfo": "KFFOWI Build/LVY48F"}

    predictor.predict(sample_input)  # warm-up

    process = psutil.Process()
    mem_before = process.memory_info().rss / 1024 / 1024

    times = []
    for _ in range(100):
        start = time.perf_counter()
        predictor.predict(sample_input)
        times.append((time.perf_counter() - start) * 1000)

    mem_after = process.memory_info().rss / 1024 / 1024
    avg_latency = float(np.mean(times))
    p95_latency = float(np.percentile(times, 95))

    print(f"Real average latency: {avg_latency:.2f} ms")
    print(f"Real P95 latency: {p95_latency:.2f} ms")
    print(f"Real process memory (correct, psutil): before {mem_before:.2f} MB -> after {mem_after:.2f} MB")

    # ============================================================
    # Save real results, same pattern as the other metrics files
    # ============================================================
    output = {
        "fraud_detection_extra": {
            "accuracy": round(float(accuracy), 4),
            "false_positive_rate": round(float(fpr), 4),
            "false_negative_rate": round(float(fnr), 4),
        },
        "system_performance": {
            "avg_inference_latency_ms": round(avg_latency, 2),
            "p95_inference_latency_ms": round(p95_latency, 2),
            "process_memory_before_mb": round(mem_before, 2),
            "process_memory_after_mb": round(mem_after, 2),
            "latency_note": (
                "This latency includes two real, live database queries per prediction "
                "(rolling-window feature lookup) -- see the database indexing fix for "
                "the before/after comparison isolating this specific bottleneck."
            ),
        },
        "note": (
            "Real, measured values from the temporal-validated IEEE-CIS model -- "
            "accuracy/FPR/FNR from the same real confusion matrix already used for "
            "precision/recall/F1; latency/memory from a real, direct benchmark of "
            "100 live predictions using the real, full live-scoring endpoint "
            "(including its real database calls), not simulated or estimated. "
            "Memory corrected to use psutil (real OS-level RSS) after the original "
            "tracemalloc measurement was found to be meaningless (0.01 MB) -- "
            "tracemalloc cannot see memory used by C-extension code like LightGBM/SHAP."
        ),
    }
    with open("streamlit_app/data/extra_metrics.json", "w") as f:
        json.dump(output, f, indent=2)
    print("\nSaved (corrected): streamlit_app/data/extra_metrics.json")


if __name__ == "__main__":
    main()