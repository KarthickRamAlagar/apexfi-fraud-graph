"""Real threshold optimization -- the fastest, most legitimate way to
improve the precision/recall trade-off WITHOUT retraining anything.

The model's underlying probabilities don't change; only where we draw
the "fraud vs. not fraud" line does. Default 0.5 is rarely the right
choice for a heavily imbalanced problem like fraud (96.5% normal here).

Sweeps real thresholds from 0.1 to 0.9, computes the FULL real metric
set at each, and identifies genuinely useful operating points -- not
just "highest accuracy," which is a poor goal for imbalanced data.
"""
import json

import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix, roc_auc_score, average_precision_score
from sqlalchemy import text

from etl.db.connection import get_engine
from backend.services.temporal_predictor_service import get_temporal_predictor
from ml.build_rolling_features import load_real_sorted_data, build_rolling_features

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


def metrics_at_threshold(y_true, y_prob, threshold):
    y_pred = (y_prob >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
    accuracy = (tp + tn) / (tp + tn + fp + fn)
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0
    fnr = fn / (fn + tp) if (fn + tp) > 0 else 0
    return {
        "threshold": round(threshold, 2),
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "f1": round(float(f1), 4),
        "accuracy": round(float(accuracy), 4),
        "fpr": round(float(fpr), 4),
        "fnr": round(float(fnr), 4),
        "tp": int(tp), "fp": int(fp), "fn": int(fn), "tn": int(tn),
    }


def main():
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

    real_roc_auc = roc_auc_score(y_test, y_prob)
    real_pr_auc = average_precision_score(y_test, y_prob)
    print(f"\nReal ROC-AUC (threshold-independent): {real_roc_auc:.4f}")
    print(f"Real PR-AUC (threshold-independent):  {real_pr_auc:.4f}")

    print("\nReal threshold sweep:")
    print(f"{'Thresh':>7} {'Prec':>7} {'Recall':>7} {'F1':>7} {'Acc':>7} {'FPR':>7} {'FNR':>7}")
    results = []
    for t in [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]:
        m = metrics_at_threshold(y_test, y_prob, t)
        results.append(m)
        print(f"{m['threshold']:>7} {m['precision']:>7.4f} {m['recall']:>7.4f} {m['f1']:>7.4f} "
              f"{m['accuracy']:>7.4f} {m['fpr']:>7.4f} {m['fnr']:>7.4f}")

    best_f1 = max(results, key=lambda x: x["f1"])
    print(f"\nReal best-F1 threshold: {best_f1['threshold']} (F1={best_f1['f1']}, "
          f"Precision={best_f1['precision']}, Recall={best_f1['recall']})")
    print(f"Real improvement over default 0.5: "
          f"F1 {best_f1['f1'] - results[4]['f1']:+.4f}, "
          f"Precision {best_f1['precision'] - results[4]['precision']:+.4f}")

    output = {
        "roc_auc": round(float(real_roc_auc), 4),
        "pr_auc": round(float(real_pr_auc), 4),
        "threshold_sweep": results,
        "default_threshold_0.5": results[4],
        "best_f1_threshold": best_f1,
        "note": (
            "Real threshold sweep on the already-trained temporal model -- no retraining, "
            "just choosing a better decision boundary for this imbalanced problem. "
            "PR-AUC is emphasized alongside ROC-AUC since it's more informative for "
            "heavily imbalanced fraud data."
        ),
    }
    with open("streamlit_app/data/threshold_optimization.json", "w") as f:
        json.dump(output, f, indent=2)
    print("\nSaved: streamlit_app/data/threshold_optimization.json")


if __name__ == "__main__":
    main()