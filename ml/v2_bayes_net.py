"""Bayesian network side model for IEEE-CIS fraud (tree-augmented naive Bayes, TAN).

Why: LightGBM scores well but is hard to explain as a story. A Bayesian network is a small, readable probability model:
  P(fraud | evidence) is built from tables P(feature state | fraud?, parent feature state) that a reviewer can read.
What it is here: 12 discretised features, the class node (fraud / normal) as the parent of every feature, plus ONE extra feature
parent per feature learned from the data (Chow-Liu tree on conditional mutual information).  A plain naive Bayes (no extra parents) is reported next to it.
Same time-ordered protocol as V2: first 60% fit, next 15% validation (threshold choice), last 25% untouched test.
It is an interpretable SIDE model. It is not used for scoring in the app and does not change any V2 number.

Run from the repo root:   uv run python ml/v2_bayes_net.py        (about 1-2 minutes, no GPU, no new package)
Output: app_data/v2_bayes_net.json
"""
import json, os, sys, time, itertools
import numpy as np, pandas as pd, pyarrow.parquet as pq
from sklearn.metrics import average_precision_score, roc_auc_score, brier_score_loss

PARQUET = sys.argv[1] if len(sys.argv) > 1 else "data/gold_parquet/ieee_cis_features.parquet"
OUT = sys.argv[2] if len(sys.argv) > 2 else "app_data/v2_bayes_net.json"
ALPHA = 1.0   # Laplace smoothing
COLS = ["transactiondt", "is_fraud", "transactionamt", "productcd", "card4", "card6", "p_emaildomain", "r_emaildomain", "dist1", "c1", "c13", "d1", "hour_of_day", "devicetype"]
df = pq.read_table(PARQUET, columns=COLS).to_pandas().sort_values("transactiondt", kind="stable").reset_index(drop=True)
n = len(df); i_fit, i_val = int(n * 0.60), int(n * 0.75)
y = df["is_fraud"].astype(int).to_numpy()
fit, val, test = slice(0, i_fit), slice(i_fit, i_val), slice(i_val, n)

# ---- discretise: every variable becomes a small set of named states (bins are learned on the fit block only) ----
def qbins(col, k, fmt="{:.0f}", prefix="", missing=True):
    s = df[col].astype(float); f = s.iloc[:i_fit].dropna()
    edges = np.unique(np.quantile(f, np.linspace(0, 1, k + 1)[1:-1]))
    lab = []
    for j in range(len(edges) + 1):
        lo = None if j == 0 else edges[j - 1]; hi = None if j == len(edges) else edges[j]
        lab.append(f"{prefix}<{fmt.format(hi)}" if lo is None else (f"{prefix}>={fmt.format(lo)}" if hi is None else f"{prefix}{fmt.format(lo)} to {fmt.format(hi)}"))
    idx = np.searchsorted(edges, s.to_numpy(), side="right"); idx = np.where(s.isna(), -1, idx)
    states = lab + (["missing"] if missing and s.isna().any() else [])
    codes = np.where(idx == -1, len(lab), idx) if "missing" in states else np.where(idx == -1, 0, idx)
    return codes, states

def cats(col, top, missing_label="missing"):
    s = df[col].astype(object).where(df[col].notna(), None)
    vc = s.iloc[:i_fit].value_counts().head(top).index.tolist()
    states = [str(v) for v in vc] + ["other"] + ([missing_label] if s.isna().any() else [])
    m = {v: i for i, v in enumerate(vc)}; oth = len(vc); mis = len(vc) + 1
    codes = np.array([mis if v is None else m.get(v, oth) for v in s], dtype=int)
    return codes, states

VARS = []   # (key, label, group, codes, states)
def add(key, label, group, cs): VARS.append((key, label, group, cs[0], cs[1]))
add("amount", "Transaction amount ($)", "Amount", qbins("transactionamt", 5, "{:.0f}", "$"))
add("product", "Product code", "Product", cats("productcd", 5))
add("card4", "Card network", "Card", cats("card4", 4))
add("card6", "Card type", "Card", cats("card6", 3))
add("p_email", "Purchaser email domain", "Email", cats("p_emaildomain", 7))
add("r_email", "Recipient email domain", "Email", cats("r_emaildomain", 4))
add("dist1", "Distance 1", "Distance", qbins("dist1", 3, "{:.0f}"))
add("c1", "Count C1", "Counts", qbins("c1", 4, "{:.0f}"))
add("c13", "Count C13", "Counts", qbins("c13", 4, "{:.0f}"))
add("d1", "Days since previous (D1)", "Time deltas", qbins("d1", 3, "{:.0f}"))
hr = df["hour_of_day"].astype(float).to_numpy()
add("hour", "Hour of day", "Time", (np.select([hr < 6, hr < 12, hr < 18], [0, 1, 2], 3), ["00-05", "06-11", "12-17", "18-23"]))
add("device", "Device type", "Device", cats("devicetype", 2))
V = len(VARS); K = [len(v[4]) for v in VARS]
Xc = np.stack([v[3] for v in VARS], axis=1)

# ---- structure: Chow-Liu tree on conditional mutual information I(Xi;Xj | class), fit block only ----
def cmi(i, j):
    tot = 0.0; a = Xc[fit, i]; b = Xc[fit, j]; yy = y[fit]
    for c in (0, 1):
        m = yy == c; pc = m.mean()
        if m.sum() == 0: continue
        J = np.zeros((K[i], K[j])); np.add.at(J, (a[m], b[m]), 1); J = (J + 0.1) / (J.sum() + 0.1 * K[i] * K[j])
        pi, pj = J.sum(1, keepdims=True), J.sum(0, keepdims=True)
        tot += pc * float((J * np.log(J / (pi * pj))).sum())
    return tot
W = np.zeros((V, V))
for i, j in itertools.combinations(range(V), 2): W[i, j] = W[j, i] = cmi(i, j)
parent = [-1] * V; seen = {0}; edges = []
while len(seen) < V:
    best = max(((W[i, j], i, j) for i in seen for j in range(V) if j not in seen))
    _, i, j = best; parent[j] = i; seen.add(j); edges.append({"from": VARS[i][0], "to": VARS[j][0], "cmi": round(float(best[0]), 5)})

# ---- parameters: P(class) and P(Xi | class, parent) with Laplace smoothing ----
def fit_cpts(use_parent):
    prior = np.array([(y[fit] == c).sum() + ALPHA for c in (0, 1)], float); prior /= prior.sum()
    cpt = []
    for i in range(V):
        pa = parent[i] if use_parent else -1
        kp = K[pa] if pa >= 0 else 1
        T = np.full((2, kp, K[i]), ALPHA)
        np.add.at(T, (y[fit], Xc[fit, pa] if pa >= 0 else np.zeros(i_fit, int), Xc[fit, i]), 1)
        T /= T.sum(2, keepdims=True); cpt.append(T)
    return prior, cpt

def predict(prior, cpt, use_parent, sl):
    ll = np.tile(np.log(prior), (len(range(*sl.indices(n))), 1))
    for i in range(V):
        pa = parent[i] if use_parent else -1
        pidx = Xc[sl, pa] if pa >= 0 else np.zeros(len(ll), int)
        for c in (0, 1): ll[:, c] += np.log(cpt[i][c, pidx, Xc[sl, i]])
    ll -= ll.max(1, keepdims=True); p = np.exp(ll); return p[:, 1] / p.sum(1)

def metrics(p_val, p_test):
    ths = np.unique(np.quantile(p_val, np.linspace(0.5, 0.999, 400)))
    f1s = []
    for t in ths:
        pr = p_val >= t; tp = (pr & (y[val] == 1)).sum(); pre = tp / max(pr.sum(), 1); rec = tp / max((y[val] == 1).sum(), 1)
        f1s.append(2 * pre * rec / max(pre + rec, 1e-12))
    th = float(ths[int(np.argmax(f1s))]); pr = p_test >= th; yt = y[test]
    tp = int((pr & (yt == 1)).sum()); fp = int((pr & (yt == 0)).sum()); fn = int((~pr & (yt == 1)).sum()); tn = int((~pr & (yt == 0)).sum())
    pre = tp / max(tp + fp, 1); rec = tp / max(tp + fn, 1)
    return {"threshold": th, "pr_auc": float(average_precision_score(yt, p_test)), "roc_auc": float(roc_auc_score(yt, p_test)), "precision": pre, "recall": rec,
            "f1": 2 * pre * rec / max(pre + rec, 1e-12), "brier": float(brier_score_loss(yt, p_test)), "tp": tp, "fp": fp, "fn": fn, "tn": tn}

t0 = time.time()
res = {}
for name, up in (("naive_bayes", False), ("tan", True)):
    prior, cpt = fit_cpts(up)
    res[name] = metrics(predict(prior, cpt, up, val), predict(prior, cpt, up, test))
    if up: P_PRIOR, P_CPT = prior, cpt
    print(name, {k: round(v, 4) if isinstance(v, float) else v for k, v in res[name].items()}, flush=True)

# single-variable view: fraud rate in every state (fit block) = the easiest table to read
single = []
for i, (key, label, group, codes, states) in enumerate(VARS):
    rows = []
    for s, st in enumerate(states):
        m = codes[:i_fit] == s
        if m.sum(): rows.append({"state": st, "rows": int(m.sum()), "fraud_rate_pct": round(float(y[:i_fit][m].mean() * 100), 2)})
    single.append({"key": key, "label": label, "rows": rows})
out = {
    "model": "Tree-augmented naive Bayes (Bayesian network) on 12 discretised features",
    "protocol": "Time-ordered: first 60% fit, next 15% validation (threshold), last 25% test (same test block as V2).",
    "fit_rows": int(i_fit), "test_rows": int(n - i_val), "test_frauds": int(y[test].sum()), "base_rate_pct": round(float(y[fit].mean() * 100), 3),
    "alpha": ALPHA,
    "variables": [{"key": k, "label": l, "group": g, "states": s, "parent": (VARS[parent[i]][0] if parent[i] >= 0 else None)} for i, (k, l, g, _, s) in enumerate(VARS)],
    "edges": edges, "prior": [round(float(x), 6) for x in P_PRIOR],
    "cpt": {VARS[i][0]: np.round(P_CPT[i], 5).tolist() for i in range(V)},   # [class][parent state][state]
    "metrics": res, "single_variable": single,
    "note": "Interpretable side model. It uses 12 coarse features, so it ranks fraud worse than the 449-feature LightGBM. It is not used for scoring in the app.",
    "seconds": round(time.time() - t0, 1),
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w"))
print("saved", OUT, f"{os.path.getsize(OUT)/1024:.0f} KB")
