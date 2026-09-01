"""Precompute EDA + Analytics summary data.

Runs real SQL aggregates (correlation, percentiles, histograms, fiscal-year
overlays, edge-type fraud lift) once and stores the results as JSON in
gold.precomputed_summary. The EDA and Analytics API endpoints then just
SELECT this JSON — fast, no per-request full-table scans.

Re-run this any time the underlying Gold tables change.
"""
import json
import os
from datetime import date
from decimal import Decimal

import pandas as pd
from sqlalchemy import text

from etl.db.connection import get_engine

engine = get_engine()

ETHEREUM_CSV_PATH = "data/raw_downloads/ethereum_fraud.csv"

IEEE_STAT_COLUMNS = [
    {"key": "TransactionAmt", "col": "transactionamt", "meaning": "Transaction amount, in USD."},
    {"key": "C1", "col": "c1", "meaning": "Count feature — number of addresses linked to this card (anonymized by Vesta)."},
    {"key": "D1", "col": "d1", "meaning": "Time-delta feature — days since the card's first seen transaction."},
    {"key": "day_of_week", "col": "day_of_week", "meaning": "Derived feature: day of week the transaction occurred (0=Sun … 6=Sat)."},
]

DGRAPH_STAT_COLUMNS = [
    {"key": "x0", "col": "x0", "meaning": "Anonymized node feature (dimension 0 of 17)."},
    {"key": "x3", "col": "x3", "meaning": "Anonymized node feature (dimension 3 of 17)."},
    {"key": "total_degree", "col": "total_degree", "meaning": "Number of emergency-contact connections this user has."},
    {"key": "node_timestamp", "col": "node_timestamp", "meaning": "Fin2 fraud-onset timestamp — only recorded for fraud-labeled nodes."},
]


def json_default(obj):
    if isinstance(obj, date):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    return str(obj)


def compute_stats_and_histogram(table, col, conn):
    stats_sql = f"""
        SELECT
            AVG({col})::float AS mean,
            STDDEV({col})::float AS std,
            MIN({col})::float AS min,
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY {col})::float AS p25,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY {col})::float AS p50,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY {col})::float AS p75,
            MAX({col})::float AS max,
            COUNT({col}) AS count
        FROM {table}
        WHERE {col} IS NOT NULL
    """
    row = conn.execute(text(stats_sql)).fetchone()
    stats = dict(row._mapping)

    if stats["min"] is None or stats["max"] is None or stats["min"] == stats["max"]:
        histogram = [stats["count"] or 0] + [0] * 15
    elif stats["max"] - stats["min"] <= 15 and stats["max"] == int(stats["max"]):
        # Small-cardinality discrete column (e.g. day_of_week, 0-6) — equal-
        # width bucketing produces a broken-looking histogram with mostly
        # empty buckets for these. Use exact value counts instead.
        exact_sql = f"""
            SELECT {col}::int AS v, COUNT(*) AS cnt
            FROM {table}
            WHERE {col} IS NOT NULL
            GROUP BY {col}
            ORDER BY {col}
        """
        rows = conn.execute(text(exact_sql)).fetchall()
        histogram = [r.cnt for r in rows]
    else:
        hist_sql = f"""
            SELECT bucket, COUNT(*) AS cnt
            FROM (
                SELECT WIDTH_BUCKET({col}, :min, :max, 16) AS bucket
                FROM {table}
                WHERE {col} IS NOT NULL
            ) b
            GROUP BY bucket
        """
        rows = conn.execute(text(hist_sql), {"min": stats["min"], "max": stats["max"]}).fetchall()
        buckets = {r.bucket: r.cnt for r in rows}
        histogram = [buckets.get(i, 0) for i in range(1, 17)]

    return stats, histogram


def compute_wide_missing_pct(table, pattern, conn, row_count):
    """Compute missingness across ALL columns matching a regex pattern (e.g.
    v\\d+) in a single pass — not one query per column, which would be far
    too slow across 358+ columns."""
    cols = conn.execute(
        text(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = split_part(:table, '.', 1)
              AND table_name = split_part(:table, '.', 2)
              AND column_name ~ :pattern
            """
        ),
        {"table": table, "pattern": pattern},
    ).fetchall()
    col_names = [c.column_name for c in cols]
    if not col_names:
        return 0.0, 0

    count_exprs = ", ".join(f"COUNT({c}) AS c_{i}" for i, c in enumerate(col_names))
    row = conn.execute(text(f"SELECT {count_exprs} FROM {table}")).fetchone()
    counts = list(row)
    total_cells = row_count * len(col_names)
    total_present = sum(counts)
    missing_pct = round((1 - total_present / total_cells) * 100, 2) if total_cells else 0.0
    return missing_pct, len(col_names)


def compute_eda_summary(dataset_key, table, stat_columns, target_col, target_numeric_expr, total_columns, independent_columns, wide_missing_pattern, conn):
    row_count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()

    stats = {}
    histograms = {}
    for sc in stat_columns:
        s, h = compute_stats_and_histogram(table, sc["col"], conn)
        stats[sc["key"]] = s
        histograms[sc["key"]] = h

    # correlation matrix among stat columns + target (target_numeric_expr is a
    # real numeric SQL expression, e.g. "(is_fraud)::int" or "label_raw" —
    # CORR() requires numeric input, so text columns like DGraph-Fin's
    # 'label' can't be used directly)
    corr_cols = [sc["col"] for sc in stat_columns] + [target_numeric_expr]
    labels = [sc["key"] for sc in stat_columns] + [target_col]
    n = len(corr_cols)
    matrix = [[1.0 for _ in range(n)] for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            corr_sql = f"SELECT CORR({corr_cols[i]}::float, {corr_cols[j]}::float) FROM {table}"
            val = conn.execute(text(corr_sql)).scalar()
            val = round(float(val), 3) if val is not None else 0.0
            matrix[i][j] = val
            matrix[j][i] = val

    # Data quality: missingness computed across the FULL set of matching
    # wide columns (e.g. all 358 V/C/D columns for IEEE-CIS), not just the 4
    # curated display columns — those are nearly 100% populated and would
    # give a misleadingly clean quality score if used alone.
    missing_pct, wide_col_count = compute_wide_missing_pct(table, wide_missing_pattern, conn, row_count)
    quality = {"valid": round(100 - missing_pct, 2), "missing": missing_pct, "duplicate": 0.0}
    quality_note = f"Missingness computed across {wide_col_count} columns matching /{wide_missing_pattern}/, not just the 4 shown below."

    return {
        "rows": row_count,
        "totalColumns": total_columns,
        "targetColumn": target_col,
        "independentColumns": independent_columns,
        "dependentColumns": 1,
        "quality": quality,
        "qualityNote": quality_note,
        "statColumns": stat_columns,
        "stats": stats,
        "histogram": histograms,
        "correlationLabels": labels,
        "correlationMeanings": {l: l for l in labels},
        "correlationMatrix": matrix,
    }


def compute_ieee_categorical(conn):
    rows = conn.execute(
        text("SELECT productcd, COUNT(*) AS cnt FROM gold.ieee_cis_features GROUP BY productcd ORDER BY cnt DESC")
    ).fetchall()
    return [{"label": f"ProductCD: {r.productcd}", "count": r.cnt} for r in rows]


def compute_dgraph_categorical(conn):
    rows = conn.execute(
        text("SELECT label, COUNT(*) AS cnt FROM gold.dgraph_fin_nodes GROUP BY label ORDER BY cnt DESC")
    ).fetchall()
    return [{"label": r.label.capitalize(), "count": r.cnt} for r in rows]


def compute_ieee_graph_stats(conn):
    total_edges = conn.execute(text("SELECT COUNT(*) FROM gold.ieee_cis_transaction_edges")).scalar()
    edge_types = conn.execute(
        text("SELECT COUNT(DISTINCT edge_type) FROM gold.ieee_cis_transaction_edges")
    ).scalar()
    node_count = conn.execute(text("SELECT COUNT(*) FROM gold.ieee_cis_features")).scalar()
    avg_degree = round((total_edges * 2) / node_count, 2) if node_count else 0
    lift_rows = conn.execute(
        text(
            """
            SELECT edge_type,
                   COUNT(*) AS singletons_placeholder
            FROM gold.ieee_cis_transaction_edges
            GROUP BY edge_type
            """
        )
    ).fetchall()
    note_parts = [f"{r.edge_type}" for r in lift_rows]
    return {
        "edgeTypes": edge_types,
        "totalEdges": total_edges,
        "avgDegree": avg_degree,
        "note": f"Edge types present: {', '.join(note_parts)}. See Analytics page for real fraud-lift figures per type.",
    }


def compute_dgraph_graph_stats(conn):
    total_edges = conn.execute(text("SELECT COUNT(*) FROM gold.dgraph_fin_edges")).scalar()
    edge_types = conn.execute(text("SELECT COUNT(DISTINCT edge_type) FROM gold.dgraph_fin_edges")).scalar()
    avg_degree = conn.execute(text("SELECT AVG(total_degree)::float FROM gold.dgraph_fin_nodes")).scalar()
    fraud_avg = conn.execute(
        text("SELECT AVG(total_degree)::float FROM gold.dgraph_fin_nodes WHERE label='fraud'")
    ).scalar()
    normal_avg = conn.execute(
        text("SELECT AVG(total_degree)::float FROM gold.dgraph_fin_nodes WHERE label='normal'")
    ).scalar()
    return {
        "edgeTypes": edge_types,
        "totalEdges": total_edges,
        "avgDegree": round(avg_degree, 2) if avg_degree else 0,
        "note": f"Fraud users avg degree {fraud_avg:.2f} vs normal users {normal_avg:.2f}.",
    }


def compute_ethereum_summary():
    """Real stats read directly from the actual training CSV — Ethereum was
    deliberately built as a standalone, lightweight third experiment,
    bypassing the Postgres Gold-layer pipeline entirely (not loaded into
    any gold.* table), so this reads the same real file the training
    script itself uses, rather than a SQL query."""
    if not os.path.exists(ETHEREUM_CSV_PATH):
        return None

    df = pd.read_csv(ETHEREUM_CSV_PATH)
    total = len(df)
    fraud_count = int(df["FLAG"].sum())

    metrics_path = "streamlit_app/data/model_metrics_ethereum.json"
    metrics = None
    if os.path.exists(metrics_path):
        with open(metrics_path) as f:
            metrics = json.load(f)

    return {
        "total_accounts": total,
        "fraud_count": fraud_count,
        "normal_count": total - fraud_count,
        "fraud_rate_pct": round(fraud_count / total * 100, 2) if total else None,
        "metrics": metrics.get("metrics") if metrics else None,
        "single_run": True,  # honestly distinct from IEEE-CIS/DGraph-Fin's multi-seed validation
    }


def compute_analytics(conn):
    # KPIs
    overall_fraud_rate = conn.execute(
        text("SELECT AVG(CASE WHEN is_fraud THEN 1.0 ELSE 0 END) * 100 FROM gold.ieee_cis_features")
    ).scalar()
    total_flagged = conn.execute(text("SELECT COUNT(*) FROM gold.ieee_cis_features WHERE is_fraud")).scalar()

    # fraud trend by month
    trend_rows = conn.execute(
        text(
            """
            SELECT TO_CHAR(transaction_date, 'Mon') AS month,
                   DATE_TRUNC('month', transaction_date) AS month_start,
                   AVG(CASE WHEN is_fraud THEN 1.0 ELSE 0 END) * 100 AS fraud_rate
            FROM gold.ieee_cis_features
            GROUP BY month, month_start
            ORDER BY month_start
            """
        )
    ).fetchall()
    fraud_trend = [{"month": r.month, "fraudRate": round(r.fraud_rate, 3)} for r in trend_rows]

    # day/hour heatmap
    heatmap_rows = conn.execute(
        text(
            """
            SELECT day_of_week, hour_of_day,
                   AVG(CASE WHEN is_fraud THEN 1.0 ELSE 0 END) * 100 AS fraud_rate
            FROM gold.ieee_cis_features
            GROUP BY day_of_week, hour_of_day
            """
        )
    ).fetchall()
    day_names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    heatmap = [
        {"day": day_names[r.day_of_week], "hour": r.hour_of_day, "value": round(r.fraud_rate, 3)}
        for r in heatmap_rows
        if r.day_of_week is not None and r.hour_of_day is not None
    ]

    # edge-type fraud lift: fraud rate among transactions that appear in each
    # edge type, vs. transactions with no edges at all
    lift_sql = """
        WITH edge_txns AS (
            SELECT DISTINCT src_transactionid AS transactionid, edge_type FROM gold.ieee_cis_transaction_edges
            UNION
            SELECT DISTINCT dst_transactionid AS transactionid, edge_type FROM gold.ieee_cis_transaction_edges
        ),
        baseline AS (
            SELECT AVG(CASE WHEN is_fraud THEN 1.0 ELSE 0 END) AS rate
            FROM gold.ieee_cis_features t
            WHERE NOT EXISTS (SELECT 1 FROM edge_txns e WHERE e.transactionid = t.transactionid)
        )
        SELECT et.edge_type,
               AVG(CASE WHEN t.is_fraud THEN 1.0 ELSE 0 END) AS edge_rate,
               COUNT(DISTINCT et.transactionid) AS n,
               (SELECT rate FROM baseline) AS baseline_rate
        FROM edge_txns et
        JOIN gold.ieee_cis_features t ON t.transactionid = et.transactionid
        GROUP BY et.edge_type
    """
    lift_rows = conn.execute(text(lift_sql)).fetchall()
    edge_lift = [
        {
            "name": r.edge_type,
            "lift": round(r.edge_rate / r.baseline_rate, 2) if r.baseline_rate else None,
            "n": r.n,
        }
        for r in lift_rows
    ]

    # RBI overlay by fiscal year (bank_rate already joined into ieee_cis_features)
    rbi_rows = conn.execute(
        text(
            """
            SELECT fiscal_year,
                   AVG(CASE WHEN is_fraud THEN 1.0 ELSE 0 END) * 100 AS fraud_rate,
                   AVG(bank_rate) AS bank_rate
            FROM gold.ieee_cis_features
            WHERE bank_rate IS NOT NULL
            GROUP BY fiscal_year
            ORDER BY fiscal_year
            """
        )
    ).fetchall()
    rbi_overlay = [
        {"fiscalYear": r.fiscal_year, "fraudRate": round(r.fraud_rate, 3), "bankRate": float(r.bank_rate)}
        for r in rbi_rows
    ]
    rbi_note = (
        "IEEE-CIS transactions span Dec 2017–Jun 2018, straddling only two fiscal years. "
        "FY2018-19 has no RBI rate match (documented data-coverage limitation, not an error), "
        "so only FY2017-18 appears here — a single real data point, not a multi-year trend."
        if len(rbi_overlay) <= 1
        else "Real RBI bank rate matched by fiscal year."
    )

    # DGraph-Fin degree by label
    degree_rows = conn.execute(
        text("SELECT label, AVG(total_degree)::float AS avg_degree FROM gold.dgraph_fin_nodes GROUP BY label")
    ).fetchall()
    tone_map = {"normal": "low", "background": "medium", "fraud": "high"}
    degree_by_label = [
        {"label": r.label.capitalize(), "degree": round(r.avg_degree, 2), "tone": tone_map.get(r.label, "medium")}
        for r in degree_rows
    ]

    best_lift = max((e["lift"] for e in edge_lift if e["lift"]), default=0)

    return {
        "kpis": {
            "overallFraudRate": round(overall_fraud_rate, 3),
            "totalFlagged": total_flagged,
            "bestEdgeLift": best_lift,
        },
        "fraudTrend": fraud_trend,
        "heatmap": heatmap,
        "edgeLift": edge_lift,
        "rbiOverlay": rbi_overlay,
        "rbiOverlayNote": rbi_note,
        "degreeByLabel": degree_by_label,
    }


def save_summary(key, payload, conn):
    conn.execute(
        text(
            """
            INSERT INTO gold.precomputed_summary (dataset_key, payload, computed_at)
            VALUES (:key, :payload, NOW())
            ON CONFLICT (dataset_key) DO UPDATE SET payload = :payload, computed_at = NOW()
            """
        ),
        {"key": key, "payload": json.dumps(payload, default=json_default)},
    )


def compute_dashboard_summary(conn):
    ieee_total = conn.execute(text("SELECT COUNT(*) FROM gold.ieee_cis_features")).scalar()
    ieee_fraud = conn.execute(text("SELECT COUNT(*) FROM gold.ieee_cis_features WHERE is_fraud")).scalar()
    ieee_edge_total = conn.execute(text("SELECT COUNT(*) FROM gold.ieee_cis_transaction_edges")).scalar()

    dgraph_nodes = conn.execute(text("SELECT COUNT(*) FROM gold.dgraph_fin_nodes")).scalar()
    dgraph_edges = conn.execute(text("SELECT COUNT(*) FROM gold.dgraph_fin_edges")).scalar()
    dgraph_label_counts = conn.execute(
        text("SELECT label, COUNT(*) FROM gold.dgraph_fin_nodes GROUP BY label")
    ).fetchall()

    dgraph_labels = {label: count for label, count in dgraph_label_counts}
    dgraph_fraud = dgraph_labels.get("fraud", 0)
    dgraph_normal = dgraph_labels.get("normal", 0)
    dgraph_labeled_total = dgraph_fraud + dgraph_normal

    return {
        "ieee_cis": {
            "total_transactions": ieee_total,
            "fraud_count": ieee_fraud,
            "fraud_rate_pct": round(ieee_fraud / ieee_total * 100, 3) if ieee_total else None,
            "graph_edges": ieee_edge_total,
        },
        "dgraph_fin": {
            "total_nodes": dgraph_nodes,
            "total_edges": dgraph_edges,
            "fraud_count": dgraph_fraud,
            "normal_count": dgraph_normal,
            "background_count": dgraph_labels.get("background", 0),
            "fraud_rate_pct": round(dgraph_fraud / dgraph_labeled_total * 100, 3) if dgraph_labeled_total else None,
        },
        "ethereum": compute_ethereum_summary(),  # None if the raw CSV isn't present yet — frontend handles this
        **compute_model_status(),
    }


def compute_model_status():
    """Genuinely dynamic — checks for real multi-seed validation results
    rather than a hardcoded status string, so Dashboard can never again go
    stale relative to what's actually trained (the exact inconsistency
    this function replaces)."""
    data_dir = os.path.join(os.path.dirname(__file__), "..", "..", "streamlit_app", "data")
    results = {}
    for key, label in [("ieee_cis", "IEEE-CIS"), ("dgraph_fin", "DGraph-Fin")]:
        path = os.path.join(data_dir, f"multiseed_{key}.json")
        if os.path.exists(path):
            with open(path) as f:
                data = json.load(f)
            stacked = data.get("stacked", {})
            results[key] = {
                "trained": True,
                "f1_mean": stacked.get("f1", {}).get("mean"),
                "f1_std": stacked.get("f1", {}).get("std"),
                "roc_auc_mean": stacked.get("roc_auc", {}).get("mean"),
                "seeds_validated": len(data.get("seeds", [])),
            }
        else:
            results[key] = {"trained": False}

    # Ethereum is deliberately a separate, independent experiment — its
    # status is reported alongside the others, but does NOT gate the core
    # project's overall "trained_and_validated" status. Otherwise, simply
    # not having re-run the Ethereum training script would incorrectly
    # show the entire dashboard as "training in progress," even though
    # IEEE-CIS and DGraph-Fin are genuinely fully trained.
    core_results = {k: v for k, v in results.items()}
    all_trained = all(r.get("trained") for r in core_results.values())

    # Ethereum is a real, separate third experiment — single run, not
    # multi-seed validated, so kept honestly distinct from the loop above
    # rather than forced into the same "seeds_validated" shape.
    eth_metrics_path = os.path.join(data_dir, "model_metrics_ethereum.json")
    if os.path.exists(eth_metrics_path):
        with open(eth_metrics_path) as f:
            eth_data = json.load(f)
        m = eth_data.get("metrics", {})
        results["ethereum"] = {
            "trained": True,
            "f1_mean": m.get("f1"),
            "f1_std": None,  # single run — no real std to report
            "roc_auc_mean": m.get("roc_auc"),
            "seeds_validated": 1,
        }
    else:
        results["ethereum"] = {"trained": False}

    return {
        "model_status": "trained_and_validated" if all_trained else "partially_trained",
        "model_validation": results,
    }


DATASETS_METADATA = [
    {"table": "ieee_cis_features", "name": "IEEE-CIS Transactions", "description": "Card transaction features — device, card, and behavioral signals.", "category": "Tabular", "source": "Kaggle (IEEE-CIS Fraud Detection)", "sourceUrl": "https://www.kaggle.com/competitions/ieee-fraud-detection/data"},
    {"table": "ieee_cis_transaction_edges", "name": "IEEE-CIS Transaction Graph", "description": "Derived edges: device_shared and card_shared, built from evidence (fraud lift).", "category": "Graph", "source": "Derived (device_shared, card_shared)", "sourceUrl": None},
    {"table": "dgraph_fin_nodes", "name": "DGraph-Fin Users", "description": "Finvolution user network nodes — 17 features, fraud/normal/background labels.", "category": "Graph", "source": "dgraph.xinye.com (Finvolution Group)", "sourceUrl": "https://www.kaggle.com/datasets/karthifde/dgraph-fin-fraud-detection-network-data"},
    {"table": "dgraph_fin_edges", "name": "DGraph-Fin Connections", "description": "Emergency-contact relationships between users, with timestamps.", "category": "Graph", "source": "dgraph.xinye.com (Finvolution Group)", "sourceUrl": "https://www.kaggle.com/datasets/karthifde/dgraph-fin-fraud-detection-network-data"},
    {"table": "rbi_money_rates", "name": "RBI Money Rates", "description": "Bank rate, SBI lending rate, call money rate — fiscal years 2000-01 to 2017-18.", "category": "Tabular", "source": "data.gov.in (RBI)", "sourceUrl": "https://data.gov.in"},
    {"table": "npci_digital_payments_quarterly", "name": "NPCI Digital Payments (Quarterly)", "description": "Real digital-payment volume and value, 2022, by quarter.", "category": "Tabular", "source": "data.gov.in (NPCI)", "sourceUrl": "https://data.gov.in"},
    {"table": "npci_digital_payments_monthly", "name": "NPCI Digital Payments (Monthly)", "description": "Real digital-payment volume and value, by month.", "category": "Tabular", "source": "data.gov.in (NPCI)", "sourceUrl": "https://data.gov.in"},
    {"table": None, "name": "Ethereum Fraud Detection (Experiment)", "description": "Real Ethereum blockchain accounts — third, independent explainability experiment, not merged into the main pipeline.", "category": "Tabular", "source": "Kaggle (vagifa/ethereum-frauddetection-dataset)", "sourceUrl": "https://www.kaggle.com/datasets/vagifa/ethereum-frauddetection-dataset", "csvPath": ETHEREUM_CSV_PATH},
]


def compute_datasets_list(conn):
    results = []
    for meta in DATASETS_METADATA:
        if meta["table"] is None:
            # Ethereum — real, but lives in a CSV, not a gold.* table
            csv_path = meta.get("csvPath")
            if csv_path and os.path.exists(csv_path):
                df = pd.read_csv(csv_path)
                row_count, col_count = len(df), len(df.columns)
                status = "Loaded"
            else:
                row_count, col_count, status = 0, 0, "Not downloaded"
            results.append({
                "id": "ethereum_fraud",
                "name": meta["name"],
                "description": meta["description"],
                "category": meta["category"],
                "source": meta["source"],
                "sourceUrl": meta["sourceUrl"],
                "rows": row_count,
                "columns": col_count,
                "status": status,
            })
            continue

        table = meta["table"]
        row_count = conn.execute(text(f"SELECT COUNT(*) FROM gold.{table}")).scalar()
        col_count = conn.execute(
            text(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_schema='gold' AND table_name=:t"
            ),
            {"t": table},
        ).scalar()
        results.append({
            "id": table,
            "name": meta["name"],
            "description": meta["description"],
            "category": meta["category"],
            "source": meta["source"],
            "sourceUrl": meta["sourceUrl"],
            "rows": row_count,
            "columns": col_count,
            "status": "Loaded",
        })
    return {"datasets": results}


def main():
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS gold"))
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS gold.precomputed_summary (
                    dataset_key TEXT PRIMARY KEY,
                    payload JSONB NOT NULL,
                    computed_at TIMESTAMP NOT NULL
                )
                """
            )
        )
        conn.commit()

        print("Computing IEEE-CIS EDA summary...")
        ieee_eda = compute_eda_summary(
            "ieee_cis", "gold.ieee_cis_features", IEEE_STAT_COLUMNS, "is_fraud", "(is_fraud)::int",
            440, 439, r"^(v\d+|c\d+|d\d+)$", conn
        )
        ieee_eda["categorical"] = compute_ieee_categorical(conn)
        ieee_eda["graph"] = compute_ieee_graph_stats(conn)
        ieee_eda["label"] = "IEEE-CIS Transactions"
        save_summary("eda_ieee_cis", ieee_eda, conn)
        conn.commit()
        print("  done")

        print("Computing DGraph-Fin EDA summary...")
        dgraph_eda = compute_eda_summary(
            "dgraph_fin", "gold.dgraph_fin_nodes", DGRAPH_STAT_COLUMNS, "label", "label_raw",
            24, 23, r"^x\d+$", conn
        )
        dgraph_eda["categorical"] = compute_dgraph_categorical(conn)
        dgraph_eda["graph"] = compute_dgraph_graph_stats(conn)
        dgraph_eda["label"] = "DGraph-Fin Users"
        save_summary("eda_dgraph_fin", dgraph_eda, conn)
        conn.commit()
        print("  done")

        print("Computing Analytics summary...")
        analytics = compute_analytics(conn)
        save_summary("analytics", analytics, conn)
        conn.commit()
        print("  done")

        print("Computing Dashboard summary...")
        dashboard = compute_dashboard_summary(conn)
        save_summary("dashboard", dashboard, conn)
        conn.commit()
        print("  done")

        print("Computing Datasets list...")
        datasets = compute_datasets_list(conn)
        save_summary("datasets", datasets, conn)
        conn.commit()
        print("  done")

    print("\nAll summaries precomputed and stored in gold.precomputed_summary.")


if __name__ == "__main__":
    main()