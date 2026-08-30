"""Validation experiment (per the spec): take a few real transactions
already in the trained graph, pull their RAW field values fresh from
Postgres, run them through the NEW inference pipeline (as if they were
brand-new, never-seen transactions), and compare the resulting feature
vector + LightGBM prediction against what the EXISTING trained pipeline
already produces for that same transaction.

This is a software correctness check — it confirms the new pipeline
reproduces the trained model's real behavior. It is NOT an independent
test-set evaluation, since these transactions were already part of
training/validation — the point here is pipeline correctness, not a new
accuracy claim.
"""
import pickle

import lightgbm as lgb
import numpy as np
import torch
from sqlalchemy import text

from etl.db.connection import get_engine
from ml.new_transaction_features import build_feature_vector

N_SAMPLES = 5


def main():
    print("Loading graph and preprocessing artifacts...")
    data = torch.load("ieee_cis_graph.pt", weights_only=False)
    with open("ml/checkpoints/ieee_cis_preprocessing_artifacts.pkl", "rb") as f:
        artifacts = pickle.load(f)

    lgbm = lgb.Booster(model_file="ml/checkpoints/ieee_cis_lightgbm.txt")

    # pick a few real test-set transaction IDs
    test_idx = data.test_mask.nonzero(as_tuple=True)[0][:N_SAMPLES].tolist()
    sample_ids = [int(data.transaction_ids[i]) for i in test_idx]
    print(f"Validating against {len(sample_ids)} real test-set transactions: {sample_ids}")

    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT * FROM gold.ieee_cis_features WHERE transactionid = ANY(:ids)"),
            {"ids": sample_ids},
        ).mappings().fetchall()

    row_by_id = {r["transactionid"]: dict(r) for r in rows}

    all_close = True
    for idx, tid in zip(test_idx, sample_ids):
        raw_row = row_by_id.get(tid)
        if not raw_row:
            print(f"  TX {tid}: not found in database, skipping")
            continue

        new_vector = build_feature_vector(raw_row, artifacts)
        existing_vector = data.x[idx].numpy().reshape(1, -1)

        # degree features (last 2 columns) are EXPECTED to differ — the new
        # pipeline defaults them to 0 (Stage 1 doesn't do graph lookup yet),
        # while the existing graph has this transaction's REAL degree.
        # Compare everything else.
        n_compare = new_vector.shape[1] - len(artifacts["degree_feature_names"])
        close = np.allclose(new_vector[:, :n_compare], existing_vector[:, :n_compare], atol=1e-3)
        max_diff = np.max(np.abs(new_vector[:, :n_compare] - existing_vector[:, :n_compare]))

        new_prob = lgbm.predict(new_vector)[0]
        existing_prob = lgbm.predict(existing_vector)[0]

        status = "MATCH" if close else "MISMATCH"
        print(f"\n  TX {tid}: feature vectors {status} (max diff: {max_diff:.6f})")
        print(f"    New-pipeline LightGBM probability:      {new_prob:.4f}")
        print(f"    Existing-pipeline LightGBM probability: {existing_prob:.4f}")
        print(f"    (real historical label: {'Fraud' if data.y[idx].item() == 1 else 'Normal'})")

        if not close:
            all_close = False
            mismatch_cols = np.where(
                np.abs(new_vector[:, :n_compare] - existing_vector[:, :n_compare]) > 1e-3
            )[1]
            names = [artifacts["full_feature_order"][i] for i in mismatch_cols[:10]]
            print(f"    Mismatched columns (first 10): {names}")

    print("\n" + ("All samples matched — pipeline is correctly reproducing the trained model." if all_close
          else "Some mismatches found — see details above before trusting this pipeline."))


if __name__ == "__main__":
    main()