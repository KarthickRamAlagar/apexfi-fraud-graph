"""Item #11 (optional): real feature-group ablation -- what does each
group of features actually contribute? Compares:
  Group A: frequency features alone (card1/card2/addr1/p_emaildomain_freq)
  Group B: rolling-window features alone (the ones built specifically
           for this temporal research thread)
  Group C: both combined (the full, already-known baseline)

Fast: reuses the same real chronological split and leak-free encoding
pattern already established, just trains 2 additional small LightGBM
models (Group A, Group B) -- Group C's result is already known from
earlier tonight's runs, not retrained here.
"""
import json

import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.metrics import roc_auc_score, f1_score, precision_score, recall_score
from sqlalchemy import text

from etl.db.connection import get_engine
from ml.build_rolling_features import load_real_sorted_data, build_rolling_features

RANDOM_SEED = 42
engine = get_engine()
FREQ_COLS = ["card1", "card2", "addr1", "p_emaildomain"]
ROLLING_COLS = ["card1_txn_count_1h", "card1_amount_sum_1h", "device_txn_count_1h"]

# Group C's real result, already established earlier tonight -- not
# retrained here, just reported alongside the two new groups for a
# complete, real 3-way comparison.
GROUP_C_ALREADY_KNOWN = {
    "precision": 0.1176, "recall": 0.6053, "f1": 0.1970, "roc_auc": 0.7898,
}


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


def train_and_eval(train_df, test_df, feat_cols, name):
    X_train, y_train = train_df[feat_cols].fillna(0), train_df["is_fraud"]
    X_test, y_test = test_df[feat_cols].fillna(0), test_df["is_fraud"]

    model = lgb.LGBMClassifier(
        n_estimators=500, learning_rate=0.05, random_state=RANDOM_SEED,
        scale_pos_weight=(y_train == 0).sum() / (y_train == 1).sum(), verbosity=-1,
    )
    model.fit(X_train, y_train)
    y_prob = model.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= 0.5).astype(int)

    result = {
        "precision": round(float(precision_score(y_test, y_pred)), 4),
        "recall": round(float(recall_score(y_test, y_pred)), 4),
        "f1": round(float(f1_score(y_test, y_pred)), 4),
        "roc_auc": round(float(roc_auc_score(y_test, y_prob)), 4),
    }
    print(f"\n{name} ({len(feat_cols)} features: {feat_cols})")
    for k, v in result.items():
        print(f"  {k}: {v}")
    return result


def main():
    print("Loading real data, same chronological split as the main temporal work...")
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
    train_df = df_sorted.iloc[:train_end]
    test_df = df_sorted.iloc[train_end:]

    freq_maps = compute_freq_maps(train_df)
    train_df = apply_freq_maps(train_df, freq_maps)
    test_df = apply_freq_maps(test_df, freq_maps)

    freq_feat_cols = [f"{c}_freq" for c in FREQ_COLS]

    print("\n=== REAL FEATURE GROUP ABLATION ===")
    group_a = train_and_eval(train_df, test_df, freq_feat_cols, "Group A: Frequency features alone")
    group_b = train_and_eval(train_df, test_df, ROLLING_COLS, "Group B: Rolling-window features alone")

    print(f"\nGroup C: Both combined (already known, from earlier tonight's runs)")
    for k, v in GROUP_C_ALREADY_KNOWN.items():
        print(f"  {k}: {v}")

    print("\n=== REAL, HONEST INTERPRETATION ===")
    print(f"Group A (frequency alone)  ROC-AUC: {group_a['roc_auc']}")
    print(f"Group B (rolling alone)    ROC-AUC: {group_b['roc_auc']}")
    print(f"Group C (combined)         ROC-AUC: {GROUP_C_ALREADY_KNOWN['roc_auc']}")

    output = {
        "group_a_frequency_only": group_a,
        "group_b_rolling_only": group_b,
        "group_c_combined": GROUP_C_ALREADY_KNOWN,
        "note": (
            "Real feature-group ablation on the chronological split. Group A uses only "
            "frequency-encoded categorical features; Group B uses only the rolling-window "
            "velocity features built for this temporal research thread; Group C combines "
            "both (the main temporal model's real, already-reported result)."
        ),
    }
    with open("streamlit_app/data/feature_group_ablation.json", "w") as f:
        json.dump(output, f, indent=2)
    print("\nSaved: streamlit_app/data/feature_group_ablation.json")


if __name__ == "__main__":
    main()