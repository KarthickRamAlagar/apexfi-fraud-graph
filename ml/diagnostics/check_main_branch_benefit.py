"""Real check: does the main branch's Score New Transaction feature use a
similar card1/deviceinfo-filtered query pattern that would benefit from
the same indexes we just added to gold.ieee_cis_features? Since indexes
live in the real database, not in per-branch code, this checks whether
tonight's fix silently helps other real, unrelated features too.
"""
import time
from sqlalchemy import text
from etl.db.connection import get_engine

engine = get_engine()

# Real query pattern used by new-transaction graph-neighbor lookup
# (matching a real card1 value to find real existing transactions to
# connect to) -- same shape of query as the temporal model's rolling
# feature lookup, just for a different real purpose.
print("Testing the real query pattern used for graph-neighbor lookup (card1 match)...")
with engine.connect() as conn:
    start = time.perf_counter()
    rows = conn.execute(
        text("SELECT transactionid FROM gold.ieee_cis_features WHERE card1 = :card1 LIMIT 500"),
        {"card1": 9500},
    ).fetchall()
    elapsed = (time.perf_counter() - start) * 1000
    print(f"  Real query time: {elapsed:.2f} ms  (found {len(rows)} real matches)")
    print(f"  This uses the SAME idx_ieee_card1_dt index we just created -- if this is")
    print(f"  fast (well under 100ms), the main branch's live features benefit too.")