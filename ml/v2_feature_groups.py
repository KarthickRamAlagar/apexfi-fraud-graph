"""Feature-group evaluation for IEEE-CIS (V2 protocol).

Question: which GROUPS of columns carry the fraud signal?  For each group we report
  alone      : a LightGBM trained on that group only
  without    : a LightGBM trained on every raw column except that group
  gain share : share of the all-columns model's total split gain that belongs to the group
Same protocol as V2: sort by TransactionDT; first 60% = fit, next 15% = validation (early stopping), last 25% = untouched test.
To keep it quick (like the V2 benchmark) the fit uses a random 100,000-row sample of the fit block.  Parameters = the V2 "Default" LightGBM.
This is a side study on the 432 raw Gold columns. It is NOT the production model and does not change any V2 number.

Run from the repo root:   uv run python ml/v2_feature_groups.py            (about 15-30 minutes)
Output: app_data/v2_feature_groups.json
"""
import json, os, sys, time
import numpy as np, pandas as pd, lightgbm as lgb
from sklearn.metrics import average_precision_score, roc_auc_score

PARQUET = sys.argv[1] if len(sys.argv) > 1 else "data/gold_parquet/ieee_cis_features.parquet"
OUT = sys.argv[2] if len(sys.argv) > 2 else "app_data/v2_feature_groups.json"
SEED, SAMPLE = 42, 100_000

import pyarrow as pa, pyarrow.parquet as pq

def cols_of(prefix, lo, hi): return [f"{prefix}{i}" for i in range(lo, hi + 1)]
names = set(pq.ParquetFile(PARQUET).schema.names)
def cols(prefix, lo, hi): return [c for c in cols_of(prefix, lo, hi) if c in names]
GROUPS = {
    "Amount": ["transactionamt"], "Product": ["productcd"], "Card": cols("card", 1, 6), "Address": ["addr1", "addr2"],
    "Distance": ["dist1", "dist2"], "Email domain": ["p_emaildomain", "r_emaildomain"],
    "Vesta V1-V339": cols("v", 1, 339), "Counts C1-C14": cols("c", 1, 14), "Time deltas D1-D15": cols("d", 1, 15),
    "Match flags M1-M9": cols("m", 1, 9), "Identity id_01-id_38": [c for c in [f"id_{i:02d}" for i in range(1, 39)] if c in names],
    "Device": ["devicetype", "deviceinfo"], "Time of day / week": ["day_of_week", "hour_of_day", "is_weekend"],
    "Macro rates": ["fiscal_year", "bank_rate", "sbi_lending_rate", "call_money_rate"],
}
GROUPS = {g: [c for c in fs if c in names] for g, fs in GROUPS.items()}
ALL = [c for fs in GROUPS.values() for c in fs]
# memory-light load: float32, only the columns we need
tbl = pq.read_table(PARQUET, columns=["transactiondt", "is_fraud"] + ALL)
tbl = pa.table([tbl[c].cast(pa.float32()) if pa.types.is_floating(tbl[c].type) else tbl[c] for c in tbl.column_names], names=tbl.column_names)
df = tbl.to_pandas(); del tbl
order = np.argsort(df["transactiondt"].to_numpy(), kind="stable")
n = len(df); i_fit, i_val = int(n * 0.60), int(n * 0.75)
y_all = df["is_fraud"].astype(int).to_numpy()[order]
rng = np.random.RandomState(SEED)
fit_pos = np.sort(rng.choice(np.arange(i_fit), size=min(SAMPLE, i_fit), replace=False))
pos = np.concatenate([fit_pos, np.arange(i_fit, n)])            # sorted positions we need
X = df[ALL].iloc[order[pos]].reset_index(drop=True); del df
y = y_all[pos]
for c in X.columns:
    if not pd.api.types.is_numeric_dtype(X[c]) or pd.api.types.is_bool_dtype(X[c]):
        X[c] = X[c].astype(object).where(X[c].notna(), None).astype(str).astype("category")
nf = len(fit_pos)
fit_idx = np.arange(nf); val_idx = np.arange(nf, nf + (i_val - i_fit)); test_idx = np.arange(nf + (i_val - i_fit), len(X))
P = dict(objective="binary", n_estimators=400, learning_rate=0.06, num_leaves=63, min_child_samples=20, colsample_bytree=0.8,
         subsample=0.8, subsample_freq=1, reg_lambda=0.0, verbose=-1, n_jobs=2, random_state=SEED)

def run(feats):
    m = lgb.LGBMClassifier(**P)
    m.fit(X.iloc[fit_idx][feats], y[fit_idx], eval_set=[(X.iloc[val_idx][feats], y[val_idx])], eval_metric="average_precision",
          callbacks=[lgb.early_stopping(40, verbose=False)])
    p = m.predict_proba(X.iloc[test_idx][feats])[:, 1]
    return m, average_precision_score(y[test_idx], p), roc_auc_score(y[test_idx], p)

t0 = time.time()
m_all, pr_all, roc_all = run(ALL)
gain = pd.Series(m_all.booster_.feature_importance("gain"), index=ALL)
tot = gain.sum()
rows = []
for g, fs in GROUPS.items():
    fs = [c for c in fs if c in ALL]
    _, pr_a, roc_a = run(fs)
    _, pr_w, roc_w = run([c for c in ALL if c not in fs])
    rows.append({"group": g, "n_features": len(fs), "alone_pr": pr_a, "alone_roc": roc_a, "without_pr": pr_w, "without_roc": roc_w,
                 "drop_in_pr": pr_all - pr_w, "gain_share": float(gain[fs].sum() / tot)})
    print(f"{g:24s} n={len(fs):3d} alone PR {pr_a:.3f}  without PR {pr_w:.3f}  gain {rows[-1]['gain_share']*100:5.1f}%  ({time.time()-t0:.0f}s)", flush=True)
top = gain.sort_values(ascending=False).head(15)
grp_of = {c: g for g, fs in GROUPS.items() for c in fs}
out = {"protocol": "Time-ordered: first 60% fit (random 100,000-row sample), next 15% validation, last 25% test.", "n_columns": len(ALL),
       "test_rows": int(len(test_idx)), "test_frauds": int(y[test_idx].sum()), "all_columns": {"pr_auc": pr_all, "roc_auc": roc_all},
       "params": "V2 default LightGBM (400 trees max, learning rate 0.06, 63 leaves), early stopping on validation PR-AUC", "groups": rows,
       "top_features": [{"feature": f, "group": grp_of.get(f), "gain_share": float(v / tot)} for f, v in top.items()],
       "note": "Side study on the 432 raw Gold columns, trained on a 100,000-row sample. The production model (449 features, all fit rows) is on the V2 Evaluation tab.",
       "seconds": round(time.time() - t0)}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w"), indent=2)
print("saved", OUT)
