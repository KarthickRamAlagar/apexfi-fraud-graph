from sqlalchemy import text

from etl.db.connection import get_engine

engine = get_engine()

with engine.connect() as conn:
    tx_count = conn.execute(text("SELECT COUNT(*) FROM bronze.raw_ieee_cis_transaction")).scalar()
    id_count = conn.execute(text("SELECT COUNT(*) FROM bronze.raw_ieee_cis_identity")).scalar()
    node_count = conn.execute(text("SELECT COUNT(*) FROM bronze.raw_dgraph_fin_nodes")).scalar()
    edge_count = conn.execute(text("SELECT COUNT(*) FROM bronze.raw_dgraph_fin_edges")).scalar()

print("raw_ieee_cis_transaction:", tx_count)
print("raw_ieee_cis_identity:", id_count)
print("raw_dgraph_fin_nodes:", node_count)
print("raw_dgraph_fin_edges:", edge_count)