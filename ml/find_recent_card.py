"""Find a real card1 with genuine activity near the actual END of the
dataset's real timeline -- needed for a correct 'Load Sample' demo,
since the live scoring feature defines 'now' as the dataset's real max
transactiondt, not an arbitrary point."""
from sqlalchemy import text
from etl.db.connection import get_engine

engine = get_engine()
with engine.connect() as conn:
    max_dt = conn.execute(text("SELECT MAX(transactiondt) FROM gold.ieee_cis_features")).scalar()
    print(f"Real dataset max transactiondt: {max_dt}")

    # find a real card1 with 2+ real transactions within the true last hour
    rows = conn.execute(
        text(
            """
            SELECT card1, COUNT(*) AS cnt, SUM(transactionamt) AS total
            FROM gold.ieee_cis_features
            WHERE transactiondt >= :max_dt - 3600
            GROUP BY card1
            HAVING COUNT(*) >= 2
            ORDER BY cnt DESC
            LIMIT 5
            """
        ),
        {"max_dt": max_dt},
    ).fetchall()

    print("\nReal card1 values with genuine activity in the dataset's true final hour:")
    for r in rows:
        print(f"  card1={r.card1}: {r.cnt} real transactions, ₹{r.total:.2f} total")