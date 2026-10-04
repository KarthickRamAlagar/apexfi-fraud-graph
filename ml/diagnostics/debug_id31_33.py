"""One-off diagnostic: print the exact raw value for id_31/id_33 for one
transaction, from both the bulk-loaded path (what training/artifacts saw)
and a fresh targeted fetch (what the new pipeline sees) — to see exactly
where they differ.
"""
import pickle
import torch
from sqlalchemy import text
from etl.db.connection import get_engine

data = torch.load("ieee_cis_graph.pt", weights_only=False)
with open("ml/checkpoints/ieee_cis_preprocessing_artifacts.pkl", "rb") as f:
    artifacts = pickle.load(f)

tid = int(data.transaction_ids[data.test_mask.nonzero(as_tuple=True)[0][0]])
print(f"Checking transaction {tid}\n")

engine = get_engine()
with engine.connect() as conn:
    row = conn.execute(
        text("SELECT id_31, id_33 FROM gold.ieee_cis_features WHERE transactionid = :tid"),
        {"tid": tid},
    ).mappings().fetchone()

for col in ["id_31", "id_33"]:
    raw_val = row[col]
    mapping = artifacts["categorical_mappings"][col]
    print(f"{col}:")
    print(f"  Fresh DB fetch value: {raw_val!r}  (type: {type(raw_val).__name__})")
    print(f"  str(value): {str(raw_val)!r}")
    print(f"  In mapping? {str(raw_val) in mapping}")
    # show a few real keys from the mapping for comparison
    sample_keys = list(mapping.keys())[:5]
    print(f"  Sample real mapping keys: {sample_keys}")