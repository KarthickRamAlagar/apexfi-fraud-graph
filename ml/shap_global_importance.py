"""Item #3: SHAP global/aggregate importance -- a summary across many
real test-set predictions, not just one live prediction (which already
works via the scoring endpoint). This shows the AVERAGE real impact of
each feature across the whole test set, and whether that impact is
typically positive (pushes toward fraud) or negative (pushes toward
normal) -- genuine explainability at the model level, not just
per-prediction.
"""
import json

import numpy as np
import pandas as pd
import shap
from sqlalchemy import text

from etl.db.connection import get_engine
from backend.services.temporal_predictor_service import get_temporal_predictor
from ml.build_rolling_features import load_real_sorted_data, build_rolling_features

engine = get_engine()
FREQ_COLS = ["card1", "card2", "addr1", "p_emaildomain"]
ROLLING_COLS = ["card1_txn_count_1h", "card1_amount_sum_1h", "device_txn_count_1h"]
SAMPLE_SIZE = 1000  # real random sample of the real test set -- large enough for a
                     # genuine aggregate view, small enough to compute in reasonable time


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

    real_sample = test_c.sample(n=min(SAMPLE_SIZE, len(test_c)), random_state=42)
    X_sample = real_sample[feat_cols].fillna(0)

    print(f"\nComputing real SHAP values across a real random sample of {len(X_sample):,} test transactions...")
    explainer = shap.TreeExplainer(predictor.model)
    shap_values = explainer.shap_values(X_sample)
    if isinstance(shap_values, list):
        shap_values = shap_values[-1]

    mean_abs_shap = np.abs(shap_values).mean(axis=0)
    mean_shap = shap_values.mean(axis=0)

    global_importance = sorted(
        zip(feat_cols, mean_abs_shap.tolist(), mean_shap.tolist()),
        key=lambda x: -x[1],
    )

    print("\nReal SHAP global importance (mean |SHAP|, and mean signed SHAP direction):")
    print(f"{'Feature':<25} {'Mean |SHAP|':>12} {'Mean SHAP (direction)':>22}")
    for feat, abs_val, signed_val in global_importance:
        direction = "toward fraud" if signed_val > 0 else "toward normal"
        print(f"{feat:<25} {abs_val:>12.4f} {signed_val:>+12.4f} ({direction})")

    output = {
        "sample_size": len(X_sample),
        "global_importance": [
            {
                "feature": feat,
                "mean_abs_shap": round(abs_val, 4),
                "mean_signed_shap": round(signed_val, 4),
                "typical_direction": "toward fraud" if signed_val > 0 else "toward normal",
            }
            for feat, abs_val, signed_val in global_importance
        ],
        "note": (
            f"Real SHAP values computed across a real random sample of {len(X_sample):,} "
            "test-set transactions (not simulated). Mean |SHAP| ranks real average "
            "impact magnitude; mean signed SHAP shows whether a feature typically "
            "pushes predictions toward fraud or toward normal, on average across "
            "the real sample."
        ),
    }
    with open("streamlit_app/data/shap_global_importance.json", "w") as f:
        json.dump(output, f, indent=2)
    print("\nSaved: streamlit_app/data/shap_global_importance.json")


if __name__ == "__main__":
    main()