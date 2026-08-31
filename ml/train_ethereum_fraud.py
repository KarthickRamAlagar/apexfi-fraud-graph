"""Third, independent experiment: explainable fraud detection on real
Ethereum blockchain accounts — extending ApexFi's proven, real methodology
(leak-free feature engineering, LightGBM, SHAP explainability) to a third,
structurally different real-world domain.

This is deliberately NOT merged into the UPI/IMPS pipeline — blockchain and
UPI are genuinely different payment systems with no real shared identity.
This validates that the same proven approach generalizes, rather than
claiming a technical connection that doesn't exist.

Dataset: "Ethereum Fraud Detection Dataset" (Kaggle, vagifa) -- 9,841 real
Ethereum accounts, real FLAG label (1=fraud, 0=normal), ~22% real fraud rate.
Download from https://www.kaggle.com/datasets/vagifa/ethereum-frauddetection-dataset
and place the CSV at data/raw_downloads/ethereum_fraud.csv before running.
"""
import pickle

import lightgbm as lgb
import numpy as np
import pandas as pd
import shap
from sklearn.metrics import (
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

RAW_PATH = "data/raw_downloads/ethereum_fraud.csv"
CHECKPOINT_DIR = "ml/checkpoints"
RANDOM_SEED = 42

# Known non-feature columns in the real dataset -- index artifacts, the
# identifier, and the target itself. Everything else numeric is used as a
# feature automatically, rather than hardcoding an exact column list we
# can't fully verify without the real file in hand.
NON_FEATURE_COLS = {"Unnamed: 0", "Index", "Address", "FLAG"}
CATEGORICAL_COLS = [" ERC20 most sent token type", " ERC20_most_rec_token_type"]


def load_and_prepare():
    df = pd.read_csv(RAW_PATH)
    df.columns = [c.strip() if c.strip() not in CATEGORICAL_COLS else c for c in df.columns]
    print(f"Real Ethereum accounts loaded: {len(df):,}")
    print(f"Real fraud rate: {df['FLAG'].mean() * 100:.2f}%")
    return df


def build_features(df, train_idx, cat_maps=None):
    """Leak-free: categorical maps are fit ONLY on the passed train_idx
    subset, matching the established project-wide discipline."""
    df = df.copy()
    fit_maps = cat_maps is None
    if fit_maps:
        cat_maps = {}

    for col in CATEGORICAL_COLS:
        if col not in df.columns:
            continue
        if fit_maps:
            cats = df.loc[train_idx, col].fillna("missing").astype(str).unique()
            cat_maps[col] = {c: i for i, c in enumerate(cats)}
            cat_maps[col]["__unknown__"] = len(cat_maps[col])
        df[f"{col}_enc"] = (
            df[col].fillna("missing").astype(str).map(cat_maps[col]).fillna(cat_maps[col]["__unknown__"])
        )

    numeric_cols = [
        c for c in df.columns
        if c not in NON_FEATURE_COLS and c not in CATEGORICAL_COLS and pd.api.types.is_numeric_dtype(df[c])
    ]
    feature_cols = numeric_cols + [f"{c}_enc" for c in CATEGORICAL_COLS if c in df.columns]
    X = df[feature_cols].fillna(0)
    return X, feature_cols, cat_maps


def main():
    df = load_and_prepare()

    train_df, test_df = train_test_split(df, test_size=0.30, stratify=df["FLAG"], random_state=RANDOM_SEED)
    val_df, test_df = train_test_split(test_df, test_size=0.50, stratify=test_df["FLAG"], random_state=RANDOM_SEED)
    print(f"Train: {len(train_df):,}  Val: {len(val_df):,}  Test: {len(test_df):,}")

    full = pd.concat([train_df, val_df, test_df])
    X_full, feature_cols, cat_maps = build_features(full, train_idx=train_df.index)

    X_train = X_full.loc[train_df.index]
    X_val = X_full.loc[val_df.index]
    X_test = X_full.loc[test_df.index]
    y_train, y_val, y_test = train_df["FLAG"], val_df["FLAG"], test_df["FLAG"]

    lgbm_train = lgb.Dataset(X_train, label=y_train)
    lgbm_val = lgb.Dataset(X_val, label=y_val, reference=lgbm_train)
    params = {
        "objective": "binary", "metric": "auc", "learning_rate": 0.03, "num_leaves": 31,
        "scale_pos_weight": (y_train == 0).sum() / (y_train == 1).sum(),
        "seed": RANDOM_SEED, "verbosity": -1,
    }
    model = lgb.train(
        params, lgbm_train, num_boost_round=2000, valid_sets=[lgbm_val],
        callbacks=[lgb.early_stopping(100), lgb.log_evaluation(100)],
    )

    test_prob = model.predict(X_test)
    test_pred = (test_prob >= 0.5).astype(int)
    metrics = {
        "precision": round(precision_score(y_test, test_pred), 4),
        "recall": round(recall_score(y_test, test_pred), 4),
        "f1": round(f1_score(y_test, test_pred), 4),
        "roc_auc": round(roc_auc_score(y_test, test_prob), 4),
        "pr_auc": round(average_precision_score(y_test, test_prob), 4),
    }
    print("\nReal test-set results:")
    for k, v in metrics.items():
        print(f"  {k}: {v}")

    model.save_model(f"{CHECKPOINT_DIR}/ethereum_fraud_lightgbm.txt")
    with open(f"{CHECKPOINT_DIR}/ethereum_fraud_cat_maps.pkl", "wb") as f:
        pickle.dump({"cat_maps": cat_maps, "feature_cols": feature_cols}, f)

    explainer = shap.TreeExplainer(model)
    print("\nModel, encoders, and SHAP explainer ready.")
    print(f"Saved: {CHECKPOINT_DIR}/ethereum_fraud_lightgbm.txt")
    print(f"Saved: {CHECKPOINT_DIR}/ethereum_fraud_cat_maps.pkl")

    return model, explainer, feature_cols, cat_maps, metrics


if __name__ == "__main__":
    main()