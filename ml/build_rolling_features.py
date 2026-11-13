"""Phase 1, Step 3: real rolling-window features -- computed strictly
from PRIOR transactions only, never the current one or anything after it.

Uses transactiondt (the real, raw, second-level time-delta field) for
the actual rolling windows -- NOT transaction_date, which was confirmed
to only have day-level precision (every row pinned to midnight),
making genuine hour-based windows meaningless on that field.
transactiondt is treated as seconds-from-a-reference-point and converted
to a pandas datetime purely to get correct, real relative spacing between
transactions -- the exact calendar date it lands on doesn't matter, only
the true elapsed time between transactions, which transactiondt gives us
authentically (573,349 real distinct values out of 590,540 rows).

closed='left' remains the critical leak-free detail: strictly
[t - 1h, t), excluding the transaction's own instant.
"""
import pandas as pd
from sqlalchemy import text

from etl.db.connection import get_engine

engine = get_engine()


def load_real_sorted_data():
    with engine.connect() as conn:
        df = pd.read_sql(
            text(
                """
                SELECT transactionid, transaction_date, transactiondt, card1, deviceinfo, transactionamt, is_fraud
                FROM gold.ieee_cis_features
                ORDER BY transactiondt, transactionid
                """
            ),
            conn,
        )
    return df


def build_rolling_features(df):
    df = df.sort_values("transactiondt").reset_index(drop=True)
    df["_row_id"] = df["transactionid"]

    # real, genuine second-level spacing -- the actual calendar date this
    # lands on is arbitrary, only the TRUE elapsed time between
    # transactions matters for a real rolling window
    df["_real_time"] = pd.to_datetime(df["transactiondt"], unit="s")
    indexed = df.set_index("_real_time")

    def rolling_feature(group_col, value_col, agg):
        pieces = []
        for _, group in indexed.groupby(group_col):
            rolled = group[value_col].rolling("1h", closed="left").agg(agg)
            pieces.append(pd.DataFrame({"_row_id": group["_row_id"].values, "value": rolled.values}))
        return pd.concat(pieces, ignore_index=True)

    for col_name, group_col, value_col, agg in [
        ("card1_txn_count_1h", "card1", "_row_id", "count"),
        ("card1_amount_sum_1h", "card1", "transactionamt", "sum"),
        ("device_txn_count_1h", "deviceinfo", "_row_id", "count"),
    ]:
        feat = rolling_feature(group_col, value_col, agg)
        feat = feat.rename(columns={"value": col_name})
        df = df.merge(feat, on="_row_id", how="left")
        df[col_name] = df[col_name].fillna(0)

    df = df.drop(columns=["_row_id", "_real_time"])
    return df


def main():
    print("Loading real, sorted IEEE-CIS data (sorted by real transactiondt this time)...")
    df = load_real_sorted_data()
    print(f"Real total rows: {len(df):,}\n")

    print("Building real rolling-window features using transactiondt (genuine second-level precision)...")
    df = build_rolling_features(df)

    print("\n=== Sanity check: a real card with multiple transactions ===")
    busy_card = df["card1"].value_counts().index[0]
    sample = df[df["card1"] == busy_card].sort_values("transactiondt").head(8)
    print(f"Real card1={busy_card}, first 8 real transactions chronologically:\n")
    print(sample[["transactiondt", "card1_txn_count_1h", "card1_amount_sum_1h"]].to_string(index=False))

    print("\nReal check: the FIRST transaction above should show count=0 (no prior history).")
    print("Later ones, if genuinely close in real elapsed seconds, should now show non-zero counts.")

    print(f"\nReal feature summary across all {len(df):,} rows:")
    print(df[["card1_txn_count_1h", "card1_amount_sum_1h", "device_txn_count_1h"]].describe())

    nonzero_pct = (df["card1_txn_count_1h"] > 0).mean() * 100
    print(f"\nReal % of transactions with at least one prior same-card transaction in the last hour: {nonzero_pct:.2f}%")


if __name__ == "__main__":
    main()