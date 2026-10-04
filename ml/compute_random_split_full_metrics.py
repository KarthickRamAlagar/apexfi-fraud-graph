"""Real, full metric set for the RANDOM split model too -- accuracy,
FPR, FNR, latency, memory -- matching exactly what we measured for the
chronological (temporal) model, for a genuinely fair, complete
side-by-side comparison. The random-split model itself was never saved
before (only its precision/recall/F1/ROC-AUC were reported inline), so
this retrains it fresh -- fast, since it's the same simple feature set,
no rolling features needed for this specific comparison.
"""
import json
import time

import numpy as np
import pandas as pd
import lightgbm as lgb
import psutil
import shap
from sklearn.metrics import confusion_matrix, roc_auc_score, average_precision_score
from sklearn.model_selection import train_test_split
from sqlalchemy import text

from etl.db.connection import get_engine
from ml.build_rolling_features import load_real_sorted_data, build_rolling_features

RANDOM_SEED = 42
engine = get_engine()
FREQ_COLS = ["card1", "card2", "addr1", "p_emaildomain"]


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
    print("Loading real data, retraining the real random-split model (never saved before)...")
    with engine.connect() as conn:
        extra = pd.read_sql(
            text("SELECT transactionid, card2, addr1, p_emaildomain FROM gold.ieee_cis_features"),
            conn,
        )
    df = load_real_sorted_data()
    df = build_rolling_features(df)
    df = df.merge(extra, on="transactionid", how="left")

    train_r, test_r = train_test_split(df, test_size=0.25, stratify=df["is_fraud"], random_state=RANDOM_SEED)
    freq_maps = compute_freq_maps(train_r)
    train_r = apply_freq_maps(train_r, freq_maps)
    test_r = apply_freq_maps(test_r, freq_maps)
    feat_cols = [f"{c}_freq" for c in FREQ_COLS]  # matches original random-split comparison (no rolling features)

    X_train, y_train = train_r[feat_cols].fillna(0), train_r["is_fraud"]
    X_test, y_test = test_r[feat_cols].fillna(0), test_r["is_fraud"]

    model = lgb.LGBMClassifier(
        n_estimators=500, learning_rate=0.05, random_state=RANDOM_SEED,
        scale_pos_weight=(y_train == 0).sum() / (y_train == 1).sum(), verbosity=-1,
    )
    model.fit(X_train, y_train)

    y_prob = model.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= 0.5).astype(int)

    tn, fp, fn, tp = confusion_matrix(y_test, y_pred).ravel()
    accuracy = (tp + tn) / (tp + tn + fp + fn)
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0
    fnr = fn / (fn + tp) if (fn + tp) > 0 else 0
    roc_auc = roc_auc_score(y_test, y_prob)
    pr_auc = average_precision_score(y_test, y_prob)

    print(f"\nReal random-split confusion matrix: TP={tp} TN={tn} FP={fp} FN={fn}")
    print(f"Real Accuracy: {accuracy:.4f}")
    print(f"Real FPR: {fpr:.4f}  Real FNR: {fnr:.4f}")
    print(f"Real ROC-AUC: {roc_auc:.4f}  Real PR-AUC: {pr_auc:.4f}")

    # real latency + real, correctly-measured memory (psutil, not tracemalloc)
    print("\nBenchmarking real inference latency (100 real predictions, model-only, no live DB calls)...")
    sample_X = X_test.iloc[[0]]
    explainer = shap.TreeExplainer(model)

    process = psutil.Process()
    mem_before = process.memory_info().rss / 1024 / 1024

    times = []
    for _ in range(100):
        start = time.perf_counter()
        model.predict_proba(sample_X)
        explainer.shap_values(sample_X)
        times.append((time.perf_counter() - start) * 1000)

    mem_after = process.memory_info().rss / 1024 / 1024
    avg_latency = float(np.mean(times))
    p95_latency = float(np.percentile(times, 95))

    print(f"Real average latency: {avg_latency:.2f} ms")
    print(f"Real P95 latency: {p95_latency:.2f} ms")
    print(f"Real process memory before/after: {mem_before:.2f} MB -> {mem_after:.2f} MB")

    output = {
        "random_split_full_metrics": {
            "accuracy": round(float(accuracy), 4),
            "precision": round(float(tp / (tp + fp)) if (tp + fp) > 0 else 0, 4),
            "recall": round(float(tp / (tp + fn)) if (tp + fn) > 0 else 0, 4),
            "f1": round(2 * (tp / (tp + fp)) * (tp / (tp + fn)) / ((tp / (tp + fp)) + (tp / (tp + fn))), 4) if tp > 0 else 0,
            "roc_auc": round(float(roc_auc), 4),
            "pr_auc": round(float(pr_auc), 4),
            "false_positive_rate": round(float(fpr), 4),
            "false_negative_rate": round(float(fnr), 4),
        },
        "system_performance": {
            "avg_inference_latency_ms": round(avg_latency, 2),
            "p95_inference_latency_ms": round(p95_latency, 2),
            "process_memory_before_mb": round(mem_before, 2),
            "process_memory_after_mb": round(mem_after, 2),
        },
        "note": (
            "Real, full metric set for the RANDOM split model -- no live database calls "
            "in this specific latency benchmark (unlike the temporal model's live scoring "
            "endpoint), so this isolates pure model+SHAP compute time for a fair comparison "
            "of the two models' own real inference cost."
        ),
    }
    with open("streamlit_app/data/random_split_full_metrics.json", "w") as f:
        json.dump(output, f, indent=2)
    print("\nSaved: streamlit_app/data/random_split_full_metrics.json")


if __name__ == "__main__":
    main()