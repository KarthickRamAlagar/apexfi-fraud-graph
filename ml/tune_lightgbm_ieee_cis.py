"""Real hyperparameter search for the IEEE-CIS LightGBM model, via Optuna
— replaces hand-picked defaults with an actual evidence-based search.

Optimizes for validation PR-AUC specifically (not plain ROC-AUC) — the
more representative metric for this imbalanced, rare-positive-class
problem, and the one most aligned with what we actually care about.

Each trial is capped at a bounded round budget so the search itself stays
CPU-tractable; the FINAL model, trained with the best found parameters,
gets the full budget (up to 4000 rounds, real early stopping) — same as
our other final runs, for a fair final comparison.
"""
import json
import os

import lightgbm as lgb
import numpy as np
import optuna
import torch
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, average_precision_score, confusion_matrix,
)

GRAPH_PATH = "ieee_cis_graph.pt"
METRICS_DIR = os.path.join(os.path.dirname(__file__), "..", "streamlit_app", "data")
N_TRIALS = 40
TRIAL_ROUND_CAP = 1500


def compute_metrics(labels, preds, probs):
    return {
        "accuracy": round(accuracy_score(labels, preds), 4),
        "precision": round(precision_score(labels, preds, zero_division=0), 4),
        "recall": round(recall_score(labels, preds, zero_division=0), 4),
        "f1": round(f1_score(labels, preds, zero_division=0), 4),
        "roc_auc": round(roc_auc_score(labels, probs), 4),
        "pr_auc": round(average_precision_score(labels, probs), 4),
        "confusion_matrix": confusion_matrix(labels, preds).tolist(),
    }


def main():
    print(f"Loading graph data from {GRAPH_PATH}...")
    data = torch.load(GRAPH_PATH, weights_only=False)

    X = data.x.numpy()
    y = data.y.numpy()
    train_idx = data.train_mask.numpy()
    val_idx = data.val_mask.numpy()
    test_idx = data.test_mask.numpy()

    X_train, y_train = X[train_idx], y[train_idx]
    X_val, y_val = X[val_idx], y[val_idx]
    X_test, y_test = X[test_idx], y[test_idx]

    scale_pos_weight = (y_train == 0).sum() / max((y_train == 1).sum(), 1)
    train_set = lgb.Dataset(X_train, label=y_train)
    val_set = lgb.Dataset(X_val, label=y_val, reference=train_set)

    def objective(trial):
        params = {
            "objective": "binary",
            "metric": "auc",
            "scale_pos_weight": scale_pos_weight,
            "verbose": -1,
            "num_leaves": trial.suggest_int("num_leaves", 31, 255),
            "max_depth": trial.suggest_int("max_depth", 4, 12),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.15, log=True),
            "min_child_samples": trial.suggest_int("min_child_samples", 5, 100),
            "lambda_l1": trial.suggest_float("lambda_l1", 1e-8, 10.0, log=True),
            "lambda_l2": trial.suggest_float("lambda_l2", 1e-8, 10.0, log=True),
            "feature_fraction": trial.suggest_float("feature_fraction", 0.5, 1.0),
            "bagging_fraction": trial.suggest_float("bagging_fraction", 0.5, 1.0),
            "bagging_freq": trial.suggest_int("bagging_freq", 1, 10),
        }
        model = lgb.train(
            params, train_set, num_boost_round=TRIAL_ROUND_CAP,
            valid_sets=[val_set],
            callbacks=[lgb.early_stopping(stopping_rounds=50, verbose=False)],
        )
        val_probs = model.predict(X_val, num_iteration=model.best_iteration)
        return average_precision_score(y_val, val_probs)  # optimizing PR-AUC, not plain AUC

    print(f"Running Optuna search: {N_TRIALS} trials, each capped at {TRIAL_ROUND_CAP} rounds...")
    optuna.logging.set_verbosity(optuna.logging.WARNING)  # keep the trial-by-trial noise down
    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=N_TRIALS, show_progress_bar=True)

    print(f"\nBest validation PR-AUC found: {study.best_value:.4f}")
    print("Best parameters:")
    for k, v in study.best_params.items():
        print(f"  {k}: {v}")

    # final model: best params, full round budget, real patience — same
    # depth of training as our other final comparisons, for fairness
    final_params = {
        "objective": "binary", "metric": "auc", "scale_pos_weight": scale_pos_weight,
        "verbose": -1, **study.best_params,
    }
    print("\nTraining final model with best parameters (full budget: up to 4000 rounds)...")
    final_model = lgb.train(
        final_params, train_set, num_boost_round=4000,
        valid_sets=[val_set], valid_names=["val"],
        callbacks=[lgb.early_stopping(stopping_rounds=100), lgb.log_evaluation(period=200)],
    )

    print("\nEvaluating on held-out TEST set...")
    test_probs = final_model.predict(X_test, num_iteration=final_model.best_iteration)
    test_preds = (test_probs >= 0.5).astype(int)
    test_metrics = compute_metrics(y_test, test_preds, test_probs)

    print(f"\nFinal TEST metrics (tuned LightGBM):")
    for k, v in test_metrics.items():
        print(f"  {k}: {v}")

    os.makedirs(METRICS_DIR, exist_ok=True)
    model_path = os.path.join(os.path.dirname(__file__), "checkpoints", "ieee_cis_lightgbm_tuned.txt")
    final_model.save_model(model_path)
    print(f"\nSaved model to {model_path}")

    metrics_path = os.path.join(METRICS_DIR, "model_metrics_ieee_cis_tuned.json")
    with open(metrics_path, "w") as f:
        json.dump(
            {**test_metrics, "model": "LightGBM (Optuna-tuned)", "best_params": study.best_params},
            f, indent=2,
        )
    print(f"Saved metrics to {metrics_path}")


if __name__ == "__main__":
    main()
