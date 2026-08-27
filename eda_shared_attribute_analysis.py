"""EDA: which IEEE-CIS fields are worth turning into graph edges?

For each candidate identity-linking field, computes:
  1. unique value count (non-null)
  2. how frequently values are shared (avg group size, % of transactions
     that share their value with at least one other transaction)
  3. fraud rate among "shared" transactions vs "singleton" transactions
  4. fraud lift = shared_fraud_rate / singleton_fraud_rate
     (>1 means sharing this field correlates with higher fraud risk —
      a real signal worth building an edge on. ~1 means no signal.)

All computed in SQL — no multi-million-row pulls into Python.
"""
from sqlalchemy import text

from etl.db.connection import get_engine

CANDIDATE_FIELDS = [
    "card1", "card2", "card3", "card5", "card6",
    "addr1", "addr2",
    "p_emaildomain", "r_emaildomain",
    "devicetype", "deviceinfo",
]


def analyze_field(engine, field):
    query = f"""
    WITH value_counts AS (
        SELECT {field}, COUNT(*) AS group_size
        FROM gold.ieee_cis_features
        WHERE {field} IS NOT NULL
        GROUP BY {field}
    ),
    tagged AS (
        SELECT t.is_fraud, vc.group_size
        FROM gold.ieee_cis_features t
        JOIN value_counts vc ON t.{field} = vc.{field}
        WHERE t.{field} IS NOT NULL
    )
    SELECT
        (SELECT COUNT(*) FROM value_counts) AS unique_values,
        (SELECT COUNT(*) FROM tagged) AS non_null_txns,
        (SELECT AVG(group_size) FROM value_counts) AS avg_group_size,
        (SELECT COUNT(*) FROM tagged WHERE group_size >= 2) AS shared_txns,
        (SELECT COUNT(*) FROM tagged WHERE group_size = 1) AS singleton_txns,
        (SELECT AVG(CASE WHEN is_fraud THEN 1.0 ELSE 0 END) FROM tagged WHERE group_size >= 2) AS shared_fraud_rate,
        (SELECT AVG(CASE WHEN is_fraud THEN 1.0 ELSE 0 END) FROM tagged WHERE group_size = 1) AS singleton_fraud_rate
    """
    with engine.connect() as conn:
        row = conn.execute(text(query)).fetchone()
    return row


def main():
    engine = get_engine()

    print(f"{'Field':16} {'Unique':>9} {'AvgGrp':>8} {'Singletons':>11} {'SharedFraud%':>13} {'SingleFraud%':>13} {'Lift':>7}")
    print("-" * 95)

    for field in CANDIDATE_FIELDS:
        row = analyze_field(engine, field)
        if row.non_null_txns == 0:
            print(f"{field:16} (no non-null data)")
            continue

        shared_rate = (row.shared_fraud_rate or 0) * 100
        single_rate = (row.singleton_fraud_rate or 0) * 100
        lift = (row.shared_fraud_rate / row.singleton_fraud_rate) if row.singleton_fraud_rate else float("nan")
        singleton_note = f"{row.singleton_txns:,}" if row.singleton_txns else "0"

        print(
            f"{field:16} {row.unique_values:>9,} {row.avg_group_size:>8.1f} "
            f"{singleton_note:>11} {shared_rate:>12.2f}% {single_rate:>12.2f}% {lift:>7.2f}"
        )

    print("\nLift > 1.0 means transactions sharing this field are MORE likely to be fraud")
    print("than transactions that don't share it with anyone — a real signal worth")
    print("building a graph edge on. Lift near 1.0 = little/no signal from sharing.")
    print("A small 'Singletons' count means the SingleFraud% comparison is noisy/unreliable —")
    print("don't trust lift values built on fewer than ~100 singleton transactions.")


if __name__ == "__main__":
    main()