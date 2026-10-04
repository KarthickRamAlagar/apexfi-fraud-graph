import pandas as pd

tx = pd.read_csv("data/raw_downloads/ieee_cis/train_transaction.csv", nrows=5)
idn = pd.read_csv("data/raw_downloads/ieee_cis/train_identity.csv", nrows=5)

print("train_transaction.csv:", tx.shape)
print("train_identity.csv:", idn.shape)
print("\nidentity columns:", idn.columns.tolist())

# full row counts (reads only TransactionID column, so it's fast even on 590k rows)
tx_full = pd.read_csv("data/raw_downloads/ieee_cis/train_transaction.csv", usecols=["TransactionID", "isFraud"])
print("\nFull train_transaction row count:", len(tx_full))
print("Fraud rate:", tx_full["isFraud"].mean())