from sqlalchemy import text

from etl.db.connection import get_engine

engine = get_engine()

query = """
SELECT COUNT(*) AS total,
       SUM(CASE WHEN edge_timestamp_v2 = GREATEST(edge_timestamp - 31, 0) THEN 1 ELSE 0 END) AS matches_formula
FROM silver.dgraph_fin_edges
"""
with engine.connect() as conn:
    row = conn.execute(text(query)).fetchone()

print(f"Total edges: {row.total:,}")
print(f"Matching formula (v2 = max(v1 - 31, 0)): {row.matches_formula:,} ({row.matches_formula/row.total*100:.2f}%)")