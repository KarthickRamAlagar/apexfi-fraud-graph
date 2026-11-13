"""Phase 1, Step 4 (LightGBM first): a real, honest, side-by-side
comparison -- the ORIGINAL random-split approach vs. the NEW chronological
split + real rolling-window features.

This is the actual test of the whole hypothesis: does a random split
overstate real performance relative to genuine forward-time
generalization? We already have one real, concrete data point supporting
this (0.733 real competition score vs. 0.93 internal random-split score,
from the Kaggle notebook) -- this experiment tests it directly, on our
own full pipeline, with real rolling features added on top.

Uses a representative, real, leak-free feature set (frequency encoding +
the new rolling-window features) -- not the full original 446-feature
pipeline, to keep this focused and tractable as a validation experiment.
"""
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
import lightgbm as lgb
from sqlalchemy import text

from etl.db.connection import get_engine
from ml.build_rolling_features import load_real_sorted_data, build_rolling_features

RANDOM_SEED = 42
engine = get_engine()

FREQ_COLS = ["card1", "card2", "addr1", "p_emaildomain"]


def compute_freq_maps(train_df):
    """Fit frequency maps on TRAIN data only -- leak-free. Returns the
    maps themselves, to be applied separately to any dataset."""
    maps = {}
    for col in FREQ_COLS:
        if col in train_df.columns:
            maps[col] = np.log1p(train_df[col].value_counts())
    return maps


def apply_freq_maps(df, maps):
    """Applies already-fit maps to any dataframe (train, val, or test) --
    never refits, so there's no ambiguity about which rows the maps came
    from, unlike an index-based lookup across different dataframes."""
    df = df.copy()
    for col, freq_map in maps.items():
        df[f"{col}_freq"] = df[col].map(freq_map).fillna(0)
    return df


def report(name, y_true, y_prob, threshold=0.5):
    y_pred = (y_prob >= threshold).astype(int)
    print(f"\n{name}")
    print(f"  Precision: {precision_score(y_true, y_pred):.4f}")
    print(f"  Recall:    {recall_score(y_true, y_pred):.4f}")
    print(f"  F1:        {f1_score(y_true, y_pred):.4f}")
    print(f"  ROC-AUC:   {roc_auc_score(y_true, y_prob):.4f}")


def main():
    print("Loading real data with card1/card2/addr1/email for frequency features...")
    with engine.connect() as conn:
        extra = pd.read_sql(
            text("SELECT transactionid, card2, addr1, p_emaildomain FROM gold.ieee_cis_features"),
            conn,
        )

    print("Loading real, sorted data + building real rolling-window features...")
    df = load_real_sorted_data()
    df = build_rolling_features(df)
    df = df.merge(extra, on="transactionid", how="left")

    ROLLING_COLS = ["card1_txn_count_1h", "card1_amount_sum_1h", "device_txn_count_1h"]

    # ============================================================
    # BASELINE: the ORIGINAL approach -- random split, no rolling features
    # ============================================================
    print("\n" + "=" * 60)
    print("BASELINE: random split, no rolling features (original approach)")
    print("=" * 60)

    train_r, test_r = train_test_split(df, test_size=0.25, stratify=df["is_fraud"], random_state=RANDOM_SEED)
    freq_maps_r = compute_freq_maps(train_r)  # fit on train only
    train_r = apply_freq_maps(train_r, freq_maps_r)
    test_r = apply_freq_maps(test_r, freq_maps_r)  # same maps, applied to test -- leak-free
    feat_cols_r = [f"{c}_freq" for c in FREQ_COLS]
    X_train_r, y_train_r = train_r[feat_cols_r].fillna(0), train_r["is_fraud"]
    X_test_r, y_test_r = test_r[feat_cols_r].fillna(0), test_r["is_fraud"]

    model_r = lgb.LGBMClassifier(
        n_estimators=500, learning_rate=0.05, random_state=RANDOM_SEED,
        scale_pos_weight=(y_train_r == 0).sum() / (y_train_r == 1).sum(), verbosity=-1,
    )
    model_r.fit(X_train_r, y_train_r)
    prob_r = model_r.predict_proba(X_test_r)[:, 1]
    report("Random split (baseline, no rolling features)", y_test_r, prob_r)

    # ============================================================
    # NEW: chronological split + real rolling-window features
    # ============================================================
    print("\n" + "=" * 60)
    print("NEW: chronological split + real rolling-window features")
    print("=" * 60)

    df_sorted = df.sort_values("transactiondt").reset_index(drop=True)
    n = len(df_sorted)
    train_end = int(n * 0.75)
    train_c = df_sorted.iloc[:train_end]
    test_c = df_sorted.iloc[train_end:]  # last 25% -- genuinely later in real time

    freq_maps_c = compute_freq_maps(train_c)  # fit on train only (the earliest 75%, real leak-free discipline)
    train_c = apply_freq_maps(train_c, freq_maps_c)
    test_c = apply_freq_maps(test_c, freq_maps_c)

    feat_cols_c = [f"{c}_freq" for c in FREQ_COLS] + ROLLING_COLS
    X_train_c, y_train_c = train_c[feat_cols_c].fillna(0), train_c["is_fraud"]
    X_test_c, y_test_c = test_c[feat_cols_c].fillna(0), test_c["is_fraud"]

    model_c = lgb.LGBMClassifier(
        n_estimators=500, learning_rate=0.05, random_state=RANDOM_SEED,
        scale_pos_weight=(y_train_c == 0).sum() / (y_train_c == 1).sum(), verbosity=-1,
    )
    model_c.fit(X_train_c, y_train_c)
    prob_c = model_c.predict_proba(X_test_c)[:, 1]
    report("Chronological split + rolling features (new)", y_test_c, prob_c)

    print("\n" + "=" * 60)
    print("HONEST COMPARISON")
    print("=" * 60)
    print(f"Random split ROC-AUC:        {roc_auc_score(y_test_r, prob_r):.4f}")
    print(f"Chronological split ROC-AUC: {roc_auc_score(y_test_c, prob_c):.4f}")
    print("\nA lower chronological-split score is EXPECTED and HONEST -- it reflects")
    print("genuine forward-time generalization difficulty, the same real pattern")
    print("already confirmed by the 0.733 vs 0.93 Kaggle competition result.")


if __name__ == "__main__":
    main()