import pandas as pd
from sqlalchemy import text

from etl.db.connection import get_engine

engine = get_engine()

query = """
SELECT edge_timestamp, edge_timestamp_v2
FROM silver.dgraph_fin_edges
LIMIT 20
"""
sample = pd.read_sql(query, engine)
print("Sample rows (edge_timestamp vs edge_timestamp_v2):")
print(sample.to_string())

stats_query = """
SELECT
    MIN(edge_timestamp) AS ts1_min, MAX(edge_timestamp) AS ts1_max,
    MIN(edge_timestamp_v2) AS ts2_min, MAX(edge_timestamp_v2) AS ts2_max,
    COUNT(DISTINCT edge_timestamp) AS ts1_distinct,
    COUNT(DISTINCT edge_timestamp_v2) AS ts2_distinct
FROM silver.dgraph_fin_edges
"""
with engine.connect() as conn:
    row = conn.execute(text(stats_query)).fetchone()

print("\nRange comparison:")
print(f"  edge_timestamp:    min={row.ts1_min}, max={row.ts1_max}, distinct values={row.ts1_distinct}")
print(f"  edge_timestamp_v2: min={row.ts2_min}, max={row.ts2_max}, distinct values={row.ts2_distinct}")

# check correlation (only meaningful if both are numeric and roughly ordered similarly)
corr_query = """
SELECT CORR(edge_timestamp::float, edge_timestamp_v2::float) AS correlation
FROM silver.dgraph_fin_edges
"""
with engine.connect() as conn:
    corr = conn.execute(text(corr_query)).scalar()
print(f"\nCorrelation between the two: {corr}")