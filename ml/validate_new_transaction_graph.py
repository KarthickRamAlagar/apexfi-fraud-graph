"""Validation for Stage 2: take real test transactions that actually have
real graph connections, pretend they're brand-new (extract raw fields,
run through the new small-subgraph scorer), and compare against the
EXISTING full-graph GNN inference (already validated, used by Investigate)
for that same transaction.

Unlike Stage 1's validation, exact matching isn't the right bar here —
both the existing pipeline's random neighbor sampling AND this new
pipeline's neighbor selection are reasonable-but-different approximations
of "this node's real local neighborhood". What matters is that both
predictions land in a similar, reasonable range and agree on direction
(fraud vs. not), not that they're bit-identical.
"""
import torch
from sqlalchemy import text

from etl.db.connection import get_engine
from ml.inference import FraudPredictor
from ml.new_transaction_graph_scorer import NewTransactionGraphScorer

N_SAMPLES = 5


def main():
    print("Loading both scorers (this loads the graph + GNN twice, only for this one-off validation)...")
    predictor = FraudPredictor()  # existing, already-validated full-graph pipeline
    new_scorer = NewTransactionGraphScorer()  # new Stage 2 pipeline

    data = torch.load("ieee_cis_graph.pt", weights_only=False)

    # pick real test transactions that actually HAVE real connections —
    # otherwise this validation wouldn't meaningfully exercise the
    # neighbor-finding logic at all
    device_degree_idx = data.feature_names.index("device_shared_degree") if hasattr(data, "feature_names") else -2
    card_degree_idx = device_degree_idx + 1
    has_connections = (data.x[:, device_degree_idx] > 0) | (data.x[:, card_degree_idx] > 0)

    is_fraud = data.y == 1
    fraud_candidates = (data.test_mask & has_connections & is_fraud).nonzero(as_tuple=True)[0][:3].tolist()
    normal_candidates = (data.test_mask & has_connections & ~is_fraud).nonzero(as_tuple=True)[0][:N_SAMPLES - len(fraud_candidates)].tolist()
    candidates = fraud_candidates + normal_candidates

    if not candidates:
        print("No test-set transactions with real connections found — falling back to any test transactions.")
        candidates = data.test_mask.nonzero(as_tuple=True)[0][:N_SAMPLES].tolist()
    print(f"  ({len(fraud_candidates)} real fraud cases, {len(normal_candidates)} real normal cases — deliberately mixed, not left to chance)")

    sample_ids = [int(data.transaction_ids[i]) for i in candidates]
    print(f"\nValidating against {len(sample_ids)} real test-set transactions WITH real connections: {sample_ids}")

    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT * FROM gold.ieee_cis_features WHERE transactionid = ANY(:ids)"),
            {"ids": sample_ids},
        ).mappings().fetchall()
    row_by_id = {r["transactionid"]: dict(r) for r in rows}

    for idx, tid in zip(candidates, sample_ids):
        raw_row = row_by_id.get(tid)
        if not raw_row:
            continue

        # existing, already-validated pipeline (real full graph)
        existing_gnn_prob = predictor._gnn_probability(idx)

        # new pipeline — pretend this transaction is brand new
        result = new_scorer.score(raw_row)

        label = "Fraud" if data.y[idx].item() == 1 else "Normal"
        print(f"\n  TX {tid} (real label: {label}):")
        print(f"    Existing full-graph GNN probability: {existing_gnn_prob:.4f}")
        print(f"    New small-subgraph GNN probability:  {result['gnn_probability']:.4f}")
        print(f"    Real matched neighbors found: {result['num_hop1_neighbors']} (hop-1), "
              f"{result['num_hop2_neighbors']} (hop-2)")
        agree_direction = (existing_gnn_prob >= 0.5) == (result["gnn_probability"] >= 0.5)
        print(f"    Direction agreement (both same side of 50%): {'YES' if agree_direction else 'NO — worth investigating'}")


if __name__ == "__main__":
    main()