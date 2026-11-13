"""Full, complete comparison for TX-2987781 — ALL 446 features, not a
hand-picked subset, plus the actual real LightGBM probability on both
vectors. This is the rigorous check that should have been done first.
"""
import pickle
import lightgbm as lgb
import numpy as np
import torch
from ml.new_transaction_graph_scorer import NewTransactionGraphScorer

data = torch.load("ieee_cis_graph.pt", weights_only=False)
with open("ml/checkpoints/ieee_cis_preprocessing_artifacts.pkl", "rb") as f:
    artifacts = pickle.load(f)
lgbm = lgb.Booster(model_file="ml/checkpoints/ieee_cis_lightgbm.txt")

tid = 2987781
idx = (data.transaction_ids == tid).nonzero(as_tuple=True)[0].item()
real_vec = data.x[idx].numpy().reshape(1, -1)

raw_input = {
    "transactionamt": 10.0, "productcd": "S", "card1": 8732, "card2": 360,
    "card3": 150, "card4": "mastercard", "card5": 229, "card6": "debit",
    "addr1": 441, "addr2": 87, "r_emaildomain": "gmail.com",
    "devicetype": "mobile", "deviceinfo": "KFFOWI Build/LVY48F",
}

scorer = NewTransactionGraphScorer()
result = scorer.score(raw_input)
new_vec = result["lightgbm_feature_vector"]

real_prob = lgbm.predict(real_vec)[0]
new_prob = lgbm.predict(new_vec)[0]
print(f"\nReal (trained graph) LightGBM probability: {real_prob:.4f}")
print(f"New pipeline LightGBM probability:         {new_prob:.4f}\n")

feature_names = artifacts["full_feature_order"]
diffs = np.abs(real_vec[0] - new_vec[0])
mismatch_idx = np.where(diffs > 0.01)[0]
print(f"Total features: {len(feature_names)}")
print(f"Features that DIFFER (diff > 0.01): {len(mismatch_idx)}\n")

# show the biggest mismatches first
order = mismatch_idx[np.argsort(-diffs[mismatch_idx])]
print(f"{'Feature':<25} {'Real':<15} {'New':<15} {'Diff':<15}")
for i in order[:30]:
    print(f"{feature_names[i]:<25} {real_vec[0][i]:<15.4f} {new_vec[0][i]:<15.4f} {diffs[i]:<15.4f}")