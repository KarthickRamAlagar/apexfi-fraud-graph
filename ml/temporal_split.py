"""Phase 1, Step 2: a real chronological train/val/test split for
IEEE-CIS -- replacing the random stratified split used in the original
project. Sorted strictly by real transaction_date; the first 75% of rows
(by time, not by percentage of the calendar) become train, the next
12.5% become validation, and the final 12.5% (the most recent, real
transactions) become test.

Sorts a NARROW slice (just id + date) first, rather than sorting all 446
columns at once -- no index exists on transaction_date, so a full-width
sort is genuinely slow and can spill to temp disk space. This two-step
approach avoids that entirely.
"""
import pandas as pd
from sqlalchemy import text

from etl.db.connection import get_engine

engine = get_engine()


def get_sorted_ids():
    """Fast: sort only transactionid + transaction_date, not all 446 columns."""
    with engine.connect() as conn:
        df = pd.read_sql(
            text("SELECT transactionid, transaction_date FROM gold.ieee_cis_features ORDER BY transaction_date, transactionid"),
            conn,
        )
    return df


def chronological_split_ids(id_df, train_frac=0.75, val_frac=0.125):
    n = len(id_df)
    train_end = int(n * train_frac)
    val_end = int(n * (train_frac + val_frac))
    return (
        id_df.iloc[:train_end]["transactionid"].tolist(),
        id_df.iloc[train_end:val_end]["transactionid"].tolist(),
        id_df.iloc[val_end:]["transactionid"].tolist(),
    )


def load_full_rows(ids):
    """Fetch full rows for a specific set of IDs -- no sort needed here,
    since we already know the real chronological order from the narrow
    query above."""
    with engine.connect() as conn:
        df = pd.read_sql(
            text("SELECT * FROM gold.ieee_cis_features WHERE transactionid = ANY(:ids)"),
            conn,
            params={"ids": ids},
        )
    return df


def main():
    print("Sorting real IEEE-CIS transaction IDs by real transaction_date (fast, narrow query)...")
    id_df = get_sorted_ids()
    print(f"Real total rows: {len(id_df):,}\n")

    train_ids, val_ids, test_ids = chronological_split_ids(id_df)
    print(f"Train: {len(train_ids):,} ids  Val: {len(val_ids):,} ids  Test: {len(test_ids):,} ids\n")

    print("Loading real full data for each split...")
    train_df = load_full_rows(train_ids)
    val_df = load_full_rows(val_ids)
    test_df = load_full_rows(test_ids)

    for name, split in [("Train", train_df), ("Validation", val_df), ("Test", test_df)]:
        real_fraud_rate = split["is_fraud"].mean() * 100
        print(
            f"{name:<10} {len(split):>7,} rows  "
            f"({split['transaction_date'].min()} to {split['transaction_date'].max()})  "
            f"real fraud rate: {real_fraud_rate:.3f}%"
        )

    print("\nCompare these real fraud rates across splits above -- if fraud patterns")
    print("genuinely shift over time (a real, expected phenomenon), the splits won't")
    print("match exactly, and that's honest signal, not an error to fix.")


if __name__ == "__main__":
    main()