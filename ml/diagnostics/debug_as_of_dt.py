"""Isolate the exact value of as_of_dt inside the real predictor -- to
confirm or rule out the hypothesis that it's silently coming back as
None, which would explain all three rolling features being exactly 0.0
rather than a real, queried (possibly small) number."""
from sqlalchemy import text
from backend.services.temporal_predictor_service import get_temporal_predictor

predictor = get_temporal_predictor()

print("Direct check of the real MAX(transactiondt) query, exactly as the service runs it:\n")
with predictor.engine.connect() as conn:
    result = conn.execute(text("SELECT MAX(transactiondt) FROM gold.ieee_cis_features")).scalar()
    print(f"  Real MAX(transactiondt): {result}")
    print(f"  Real type: {type(result)}")

print("\nDirect check of the real card1=9500 rolling-feature query, using that real as_of_dt:\n")
with predictor.engine.connect() as conn:
    card_stats = conn.execute(
        text(
            """
            SELECT COUNT(*) AS cnt, COALESCE(SUM(transactionamt), 0) AS total
            FROM gold.ieee_cis_features
            WHERE card1 = :card1
              AND transactiondt < :as_of_dt
              AND transactiondt >= :as_of_dt - 3600
            """
        ),
        {"card1": 9500, "as_of_dt": result},
    ).fetchone()
    print(f"  Real query result: cnt={card_stats.cnt}, total={card_stats.total}")