"""Deep EDA endpoints. These replace the three Streamlit pages (Full Profiling, Raw Data Browser, Model Evaluation).
Everything is read from the saved snapshot in app_data/ (made by backend/services/export_snapshot.py). Nothing is typed by hand.

  GET /api/deep/overview                         row counts, column counts, fraud rates, headline 3-seed results
  GET /api/deep/profiling/{table}                every column: type, missing %, mean, std, min, max
  GET /api/deep/column/{table}/{column}          histogram (numeric) or top values (other) from the sample
  GET /api/deep/raw/{table}                      filtered, paged rows of the 50,000-row sample
  GET /api/deep/raw/{table}.csv                  the same filtered rows as a CSV download
  GET /api/deep/model-evaluation                 baseline vs GNN vs stacked, with 3-seed results
"""
import io
import json
import math
import os
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from backend.services.app_paths import DATA_DIR, data_path

router = APIRouter(prefix="/api/deep", tags=["deep-eda"])

TABLES = {
    "ieee_cis_features": {"label": "IEEE-CIS Transactions", "total_rows": 590_540},
    "dgraph_fin_nodes": {"label": "DGraph-Fin Users", "total_rows": 3_700_550},
}
_cache: dict = {}


def _check(table: str):
    if table not in TABLES:
        raise HTTPException(404, f"Unknown table '{table}'. Use one of: {', '.join(TABLES)}")


def _json(name: str):
    p = data_path(name)
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def _clean(v):
    """JSON cannot carry NaN or numpy types."""
    if v is None:
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating, float)):
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if isinstance(v, pd.Timestamp):
        return v.isoformat()
    if pd.isna(v) if not isinstance(v, (list, dict, str)) else False:
        return None
    return v


def _stats(table: str) -> pd.DataFrame:
    k = ("stats", table)
    if k not in _cache:
        p = data_path(f"{table}_column_stats.parquet")
        if not os.path.exists(p):
            raise HTTPException(404, f"{os.path.basename(p)} not found in {os.path.basename(DATA_DIR)}/. Run: uv run python -m backend.services.export_snapshot")
        _cache[k] = pd.read_parquet(p)
    return _cache[k]


def _sample(table: str) -> pd.DataFrame:
    k = ("sample", table)
    if k not in _cache:
        p = data_path(f"{table}_sample.parquet")
        if not os.path.exists(p):
            raise HTTPException(404, f"{os.path.basename(p)} not found in {os.path.basename(DATA_DIR)}/. Run: uv run python -m backend.services.export_snapshot")
        _cache[k] = pd.read_parquet(p)
    return _cache[k]


@router.get("/overview")
def overview():
    out = {"datasets": [], "models": [], "snapshotFolder": os.path.basename(DATA_DIR)}
    for key, name, fr in (("eda_ieee_cis", "IEEE-CIS Transactions", "ieee_cis"), ("eda_dgraph_fin", "DGraph-Fin Users", "dgraph_fin")):
        s = _json(f"summary_{key}.json")
        dash = _json("summary_dashboard.json") or {}
        rate = (dash.get(fr) or {}).get("fraud_rate_pct")
        out["datasets"].append({
            "key": "ieee_cis_features" if fr == "ieee_cis" else "dgraph_fin_nodes",
            "label": name,
            "rows": (s or {}).get("rows"),
            "totalColumns": (len(_stats("ieee_cis_features")) if fr == "ieee_cis" else len(_stats("dgraph_fin_nodes"))),
            "fraudRatePct": rate,
            "rateNote": "labelled accounts only" if fr == "dgraph_fin" else None,
        })
    for key, label in (("ieee_cis", "IEEE-CIS (stacked model)"), ("dgraph_fin", "DGraph-Fin (stacked model)")):
        ms = _json(f"multiseed_{key}.json")
        row = {"key": key, "label": label, "validated": bool(ms)}
        if ms:
            s = ms["stacked"]
            row.update({"f1Mean": s["f1"]["mean"], "f1Std": s["f1"]["std"], "rocAuc": s["roc_auc"]["mean"], "seeds": len(ms.get("seeds", []))})
        out["models"].append(row)
    return out


@router.get("/profiling/{table}")
def profiling(table: str):
    _check(table)
    df = _stats(table)
    rows = [{k: _clean(v) for k, v in r.items()} for r in df.to_dict("records")]
    worst = sorted([r for r in rows if r["missing_pct"] is not None], key=lambda r: -r["missing_pct"])[:40]
    return {
        "table": table, "label": TABLES[table]["label"], "totalRows": TABLES[table]["total_rows"],
        "columnCount": len(rows), "columns": rows,
        "worstMissing": [{"column": r["column"], "missingPct": r["missing_pct"]} for r in worst],
    }


@router.get("/column/{table}/{column}")
def column_detail(table: str, column: str):
    _check(table)
    st = _stats(table)
    hit = st[st["column"] == column]
    if hit.empty:
        raise HTTPException(404, f"Column '{column}' not found in {table}")
    stat = {k: _clean(v) for k, v in hit.iloc[0].to_dict().items()}
    sm = _sample(table)
    out = {"column": column, "stats": stat, "sampleRows": len(sm), "histogram": None, "valueCounts": None}
    if column not in sm.columns:
        return out
    ser = sm[column]
    if stat.get("is_numeric") and pd.api.types.is_numeric_dtype(ser):
        v = ser.dropna().to_numpy(dtype=float)
        if len(v):
            counts, edges = np.histogram(v, bins=40)
            out["histogram"] = {"counts": counts.tolist(), "edges": [float(e) for e in edges]}
    else:
        vc = ser.astype(str).value_counts().head(20)
        out["valueCounts"] = [{"value": str(i), "count": int(c)} for i, c in vc.items()]
    return out


def _filtered(table, fraud, product, amt_min, amt_max, label, deg_min, deg_max) -> pd.DataFrame:
    df = _sample(table)
    if table == "ieee_cis_features":
        if fraud == "fraud" and "is_fraud" in df:
            df = df[df["is_fraud"].astype(bool)]
        elif fraud == "normal" and "is_fraud" in df:
            df = df[~df["is_fraud"].astype(bool)]
        if product and "productcd" in df:
            df = df[df["productcd"].isin([p for p in product.split(",") if p])]
        if "transactionamt" in df:
            if amt_min is not None:
                df = df[df["transactionamt"] >= amt_min]
            if amt_max is not None:
                df = df[df["transactionamt"] <= amt_max]
    else:
        if label is not None and "label" in df:
            df = df[df["label"].astype(str).isin([x for x in label.split(",") if x])]
        if "total_degree" in df:
            if deg_min is not None:
                df = df[df["total_degree"] >= deg_min]
            if deg_max is not None:
                df = df[df["total_degree"] <= deg_max]
    return df


@router.get("/raw/{table}.csv")
def raw_csv(table: str, fraud: str = "all", product: Optional[str] = None, amt_min: Optional[float] = None, amt_max: Optional[float] = None,
            label: Optional[str] = None, deg_min: Optional[int] = None, deg_max: Optional[int] = None):
    _check(table)
    df = _filtered(table, fraud, product, amt_min, amt_max, label, deg_min, deg_max)
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{table}_filtered.csv"'})


@router.get("/raw/{table}")
def raw(table: str, fraud: str = "all", product: Optional[str] = None, amt_min: Optional[float] = None, amt_max: Optional[float] = None,
        label: Optional[str] = None, deg_min: Optional[int] = None, deg_max: Optional[int] = None,
        limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
    _check(table)
    base = _sample(table)
    df = _filtered(table, fraud, product, amt_min, amt_max, label, deg_min, deg_max)
    meta = {"sampleRows": len(base), "matchRows": len(df), "totalRows": TABLES[table]["total_rows"], "label": TABLES[table]["label"]}
    # ranges and choices for the filter controls
    if table == "ieee_cis_features":
        meta["products"] = sorted(base["productcd"].dropna().astype(str).unique().tolist()) if "productcd" in base else []
        meta["amtRange"] = [float(base["transactionamt"].min()), float(base["transactionamt"].max())] if "transactionamt" in base else None
    else:
        meta["labels"] = sorted(str(x) for x in base["label"].dropna().unique()) if "label" in base else []
        meta["degreeRange"] = [int(base["total_degree"].min()), int(base["total_degree"].max())] if "total_degree" in base else None
    page = df.iloc[offset: offset + limit]
    cols = list(page.columns)
    return {"meta": meta, "columns": cols, "rows": [[_clean(v) for v in r] for r in page.itertuples(index=False, name=None)], "offset": offset, "limit": limit}


@router.get("/model-evaluation")
def model_evaluation():
    out = []
    for key, label in (("ieee_cis", "IEEE-CIS Transactions"), ("dgraph_fin", "DGraph-Fin Users")):
        gnn = _json(f"model_metrics_{key}.json")
        base = _json(f"model_metrics_{key}_baseline.json")
        stk = _json(f"model_metrics_{key}_stacked.json")
        ms = _json(f"multiseed_{key}.json")
        out.append({"key": key, "label": label, "gnn": gnn, "baseline": base, "stacked": stk, "multiseed": ms, "complete": bool(gnn and base and stk)})
    return {"datasets": out}


# ---------------------------------------------------------------------------------------------------------------
# EDA charts: box plot, scatter plot, correlation heatmap. All computed from the saved 50,000-row sample.
# ---------------------------------------------------------------------------------------------------------------
def _ieee_group(c: str) -> str:
    import re
    if c == "transactionamt": return "Amount"
    if c.startswith("card"): return "Card"
    if c in ("addr1", "addr2"): return "Address"
    if c in ("dist1", "dist2"): return "Distance"
    if re.fullmatch(r"v\d+", c): return "Vesta V1-V339"
    if re.fullmatch(r"c\d+", c): return "Counts C1-C14"
    if re.fullmatch(r"d\d+", c): return "Time deltas D1-D15"
    if re.fullmatch(r"id_\d+", c): return "Identity"
    if c in ("day_of_week", "hour_of_day", "is_weekend", "transactiondt"): return "Time"
    if c in ("bank_rate", "sbi_lending_rate", "call_money_rate", "fiscal_year"): return "Macro rates"
    return "Other"


def _dgraph_group(c: str) -> str:
    if c.startswith("x") and c[1:].isdigit(): return "Node features x0-x16"
    if "degree" in c: return "Graph degree"
    return "Other"


def _numeric(table: str) -> list:
    k = ("numcols", table)
    if k not in _cache:
        sm = _sample(table)
        skip = {"transactionid", "node_id", "is_fraud", "label_raw", "split", "node_timestamp"}
        cols = []
        for c in sm.columns:
            if c in skip: continue
            s = pd.to_numeric(sm[c], errors="coerce") if not pd.api.types.is_bool_dtype(sm[c]) else sm[c].astype(float)
            if s.notna().sum() > 200 and s.nunique() > 2:
                cols.append(c)
        _cache[k] = cols
    return _cache[k]


def _target(table: str) -> pd.Series:
    sm = _sample(table)
    if table == "ieee_cis_features":
        return sm["is_fraud"].astype(int)
    return (sm["label"].astype(str) == "fraud").astype(int)


def _classes(table: str) -> pd.Series:
    sm = _sample(table)
    if table == "ieee_cis_features":
        return sm["is_fraud"].map({True: "fraud", False: "normal"})
    return sm["label"].astype(str)


@router.get("/eda-columns/{table}")
def eda_columns(table: str):
    _check(table)
    g = _ieee_group if table == "ieee_cis_features" else _dgraph_group
    groups: dict = {}
    for c in _numeric(table):
        groups.setdefault(g(c), []).append(c)
    return {"table": table, "groups": [{"group": k, "columns": v} for k, v in groups.items()], "classes": sorted(_classes(table).dropna().unique().tolist())}


@router.get("/box/{table}")
def box(table: str, columns: str):
    _check(table)
    cols = [c for c in columns.split(",") if c][:8]
    sm, cl = _sample(table), _classes(table)
    out = []
    for c in cols:
        if c not in sm.columns:
            raise HTTPException(404, f"Column '{c}' not in the saved sample")
        s = pd.to_numeric(sm[c], errors="coerce")
        series = []
        for k in sorted(cl.dropna().unique()):
            v = s[cl == k].dropna().to_numpy(dtype=float)
            if len(v) < 5:
                continue
            q1, med, q3 = np.percentile(v, [25, 50, 75])
            iqr = q3 - q1
            lo = float(v[v >= q1 - 1.5 * iqr].min()); hi = float(v[v <= q3 + 1.5 * iqr].max())
            series.append({"class": k, "n": int(len(v)), "min": float(v.min()), "whisker_low": lo, "q1": float(q1), "median": float(med), "q3": float(q3),
                           "whisker_high": hi, "max": float(v.max()), "mean": float(v.mean()), "outliers": int(((v < lo) | (v > hi)).sum())})
        out.append({"column": c, "missing_pct": float(s.isna().mean() * 100), "series": series})
    return {"table": table, "sampleRows": len(sm), "columns": out}


@router.get("/scatter/{table}")
def scatter(table: str, x: str, y: str, n: int = Query(2500, ge=200, le=6000)):
    _check(table)
    sm, cl = _sample(table), _classes(table)
    for c in (x, y):
        if c not in sm.columns:
            raise HTTPException(404, f"Column '{c}' not in the saved sample")
    d = pd.DataFrame({"x": pd.to_numeric(sm[x], errors="coerce"), "y": pd.to_numeric(sm[y], errors="coerce"), "c": cl}).dropna()
    # keep every fraud point up to a third of the budget so the rare class is visible, fill the rest with the other classes
    fr = d[d["c"] == "fraud"]
    fr = fr.sample(min(len(fr), n // 3), random_state=7)
    rest = d[d["c"] != "fraud"].sample(min(len(d[d["c"] != "fraud"]), n - len(fr)), random_state=7)
    pts = pd.concat([rest, fr])
    corr = float(d["x"].corr(d["y"])) if len(d) > 5 else None
    return {"x": x, "y": y, "pearson": _clean(corr), "usable_rows": int(len(d)), "shown": int(len(pts)),
            "points": [[round(float(a), 4), round(float(b), 4), c] for a, b, c in zip(pts["x"], pts["y"], pts["c"])]}


@router.get("/correlation/{table}")
def correlation(table: str, columns: Optional[str] = None, top: int = Query(18, ge=3, le=30)):
    _check(table)
    sm = _sample(table)
    t = _target(table)
    if columns:
        cols = [c for c in columns.split(",") if c][:30]
        mode = "chosen columns"
    else:
        num = _numeric(table)
        df_all = pd.DataFrame({c: pd.to_numeric(sm[c], errors="coerce") for c in num})
        cc = df_all.corrwith(t).abs().sort_values(ascending=False).dropna()
        cols = cc.head(top).index.tolist()
        mode = f"{top} columns most linked to fraud"
    d = pd.DataFrame({c: pd.to_numeric(sm[c], errors="coerce") for c in cols})
    d["fraud"] = t
    m = d.corr(min_periods=50)
    names = list(m.columns)
    return {"table": table, "mode": mode, "sampleRows": len(sm), "columns": names,
            "matrix": [[_clean(round(float(v), 3)) if not pd.isna(v) else None for v in row] for row in m.to_numpy()]}
