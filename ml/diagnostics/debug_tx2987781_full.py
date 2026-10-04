"""Direct, numeric comparison: the REAL feature vector for TX-2987781
(from the trained graph) vs. what the new-transaction pipeline computes
for the same raw values — specifically the degree and frequency features,
since those are the ones most recently touched by real fixes.
"""
import pickle
import torch
from ml.new_transaction_graph_scorer import NewTransactionGraphScorer

data = torch.load("ieee_cis_graph.pt", weights_only=False)
with open("ml/checkpoints/ieee_cis_preprocessing_artifacts.pkl", "rb") as f:
    artifacts = pickle.load(f)

tid = 2987781
idx = (data.transaction_ids == tid).nonzero(as_tuple=True)[0].item()
real_vec = data.x[idx].numpy()

raw_input = {
    "transactionamt": 10.0, "productcd": "S", "card1": 8732, "card2": 360,
    "card3": 150, "card4": "mastercard", "card5": 229, "card6": "debit",
    "addr1": 441, "addr2": 87, "r_emaildomain": "gmail.com",
    "devicetype": "mobile", "deviceinfo": "KFFOWI Build/LVY48F",
}

scorer = NewTransactionGraphScorer()
result = scorer.score(raw_input)
new_vec = result["lightgbm_feature_vector"][0]

print(f"\nReal degree_shared/card_shared counts (from database connectionCounts): device=64, card=151\n")
print(f"New pipeline's computed real_degree_counts: {result['real_degree_counts']}\n")

feature_names = artifacts["full_feature_order"]
print(f"{'Feature':<25} {'Real (trained graph)':<25} {'New pipeline':<25}")
for name in ["device_shared_degree", "card_shared_degree", "card1_freq", "card2_freq", "TransactionAmt", "card1", "card5"]:
    if name in feature_names:
        i = feature_names.index(name)
        print(f"{name:<25} {real_vec[i]:<25.4f} {new_vec[i]:<25.4f}")