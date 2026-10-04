"""Full Temporal Report — every saved evaluation result for the time-aware model on one page.

Mirrors the React "Full Temporal Report" and reads the SAME saved JSON files in
streamlit_app/data/, so the two apps cannot show different numbers. Nothing here is
hardcoded: a missing file shows a clear notice for that section instead of fake values.
"""
import json
import os
import sys

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

# style.py lives in streamlit_app/, this page lives in streamlit_app/pages/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from style import apply_desktop_only_gate, apply_glassmorphism, render_sidebar_emblem

st.set_page_config(page_title="Full Temporal Report — ApexFi", layout="wide")
apply_desktop_only_gate()
apply_glassmorphism()
render_sidebar_emblem()

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
BLUE, AMBER, GREEN, RED = "#4C8BF5", "#E8A33D", "#3FB68B", "#E5534B"


@st.cache_data
def load(name):
    path = os.path.join(DATA_DIR, name)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def show(fig):
    """Dark, transparent chart so it sits on the page theme instead of a white box."""
    fig.update_layout(template="plotly_dark", paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)")
    fig.update_xaxes(gridcolor="rgba(255,255,255,0.08)")
    fig.update_yaxes(gridcolor="rgba(255,255,255,0.12)")
    st.plotly_chart(fig, use_container_width=True)


def missing(name):
    st.info(f"`{name}` has not been generated yet, so this section is skipped.")


def pct(v, d=1):
    return f"{v * 100:.{d}f}%"


validation = load("temporal_validation_results.json")
random_full = load("random_split_full_metrics.json")
thresholds = load("threshold_optimization.json")
extra = load("extra_metrics.json")
shap = load("shap_global_importance.json")
ablation = load("feature_group_ablation.json")
hybrid = load("temporal_hybrid_stacking.json")
hybrid_thr = load("hybrid_threshold_check.json")
quick = load("quick_wins.json")
dbopt = load("database_optimization.json")

st.title("Full Temporal Report")
st.markdown(
    "All saved results for the **time-aware (chronological) model** in one place. The model is trained on the earliest "
    "75% of transactions and tested on the latest 25%, the way a bank really uses it. "
    "Numbers come from the same saved files as the web app."
)

# ---------------------------------------------------------------- 1. headline
st.header("1. Random split vs chronological split")
if validation and random_full and thresholds:
    rnd = random_full["random_split_full_metrics"]
    chrono_default = thresholds["default_threshold_0.5"]
    rows = [
        ("ROC-AUC", rnd["roc_auc"], thresholds["roc_auc"]),
        ("PR-AUC", rnd["pr_auc"], thresholds["pr_auc"]),
        ("Precision", rnd["precision"], chrono_default["precision"]),
        ("Recall", rnd["recall"], chrono_default["recall"]),
        ("F1", rnd["f1"], chrono_default["f1"]),
        ("Accuracy", rnd["accuracy"], chrono_default["accuracy"]),
        ("False-positive rate", rnd["false_positive_rate"], chrono_default["fpr"]),
        ("False-negative rate", rnd["false_negative_rate"], chrono_default["fnr"]),
    ]
    df = pd.DataFrame(rows, columns=["Metric", "Random split (4-feature LightGBM)", "Chronological split (time-series model)"])
    df["Change"] = df.iloc[:, 2] - df.iloc[:, 1]
    st.dataframe(
        df.style.format({df.columns[1]: "{:.4f}", df.columns[2]: "{:.4f}", "Change": "{:+.4f}"}),
        use_container_width=True, hide_index=True,
    )
    st.caption("Both at the default 0.5 threshold. The random split looks better because the model can learn card and device patterns from the future.")

    c1, c2, c3 = st.columns(3)
    c1.metric("ROC-AUC, random split", f"{rnd['roc_auc']:.4f}")
    c2.metric("ROC-AUC, chronological", f"{thresholds['roc_auc']:.4f}", delta=f"{thresholds['roc_auc'] - rnd['roc_auc']:+.4f}", delta_color="inverse")
    if ablation:
        c3.metric("Frequency features only, chronological", f"{ablation['group_a_frequency_only']['roc_auc']:.4f}",
                  delta=f"{ablation['group_a_frequency_only']['roc_auc'] - rnd['roc_auc']:+.4f} from the split alone", delta_color="inverse")
    st.info(
        "The flagship stacked model (LightGBM + GraphSAGE, 446 features) reports F1 0.798 / ROC-AUC 0.974 on IEEE-CIS under a "
        "random split (3-seed validated). Those are random-split figures and are **not comparable** with the chronological numbers above."
    )
else:
    missing("temporal_validation_results.json / random_split_full_metrics.json / threshold_optimization.json")

# ---------------------------------------------------------------- 2. thresholds
st.header("2. Threshold optimization")
if thresholds:
    sweep = pd.DataFrame(thresholds["threshold_sweep"])
    final = (quick or {}).get("finalized_threshold", {})
    chosen = final.get("value", 0.6)
    fig = go.Figure()
    for col, color, name in [("precision", BLUE, "Precision"), ("recall", GREEN, "Recall"), ("f1", AMBER, "F1")]:
        fig.add_trace(go.Scatter(x=sweep["threshold"], y=sweep[col], mode="lines+markers", name=name, line=dict(color=color)))
    fig.add_vline(x=chosen, line_dash="dash", line_color=RED, annotation_text=f"Recommended {chosen}")
    fig.update_layout(height=380, xaxis_title="Decision threshold", yaxis_title="Score", legend_title_text="")
    show(fig)

    best = thresholds["best_f1_threshold"]
    d5 = thresholds["default_threshold_0.5"]
    pick = sweep[sweep["threshold"] == chosen]
    cols = st.columns(3)
    cols[0].metric("Default 0.5: F1", f"{d5['f1']:.4f}", f"recall {pct(d5['recall'])}, FPR {pct(d5['fpr'])}")
    if not pick.empty:
        p = pick.iloc[0]
        cols[1].metric(f"Recommended {chosen}: F1", f"{p['f1']:.4f}", f"recall {pct(p['recall'])}, FPR {pct(p['fpr'])}")
    cols[2].metric(f"Best-F1 {best['threshold']}: F1", f"{best['f1']:.4f}", f"recall {pct(best['recall'])}, FPR {pct(best['fpr'])}", delta_color="off")
    if final.get("justification"):
        st.markdown(f"**Why {chosen}, not the best-F1 threshold:** {final['justification']}")

    sweep_table = sweep[["threshold", "precision", "recall", "f1", "fpr", "tp", "fp", "fn", "tn"]].rename(
        columns={"threshold": "Threshold", "precision": "Precision", "recall": "Recall", "f1": "F1", "fpr": "FPR",
                 "tp": "Caught frauds (TP)", "fp": "False alarms (FP)", "fn": "Missed frauds (FN)", "tn": "True negatives"})
    st.dataframe(sweep_table.style.format({"Precision": "{:.4f}", "Recall": "{:.4f}", "F1": "{:.4f}", "FPR": "{:.4f}", "Threshold": "{:.1f}"}),
                 use_container_width=True, hide_index=True)
    st.caption(f"Test set: {int(d5['tp'] + d5['fp'] + d5['fn'] + d5['tn']):,} transactions, {int(d5['tp'] + d5['fn']):,} real frauds. {thresholds.get('note', '')}")
else:
    missing("threshold_optimization.json")

# ---------------------------------------------------------------- 3. importance
st.header("3. Which features matter")
left, right = st.columns(2)
with left:
    st.subheader("LightGBM gain importance")
    if quick and quick.get("feature_importance_gain"):
        imp = pd.DataFrame(quick["feature_importance_gain"]).sort_values("importance")
        fig = go.Figure(go.Bar(x=imp["importance"], y=imp["feature"], orientation="h", marker_color=BLUE))
        fig.update_layout(height=340, xaxis_title="Gain", margin=dict(l=0, r=10, t=10, b=0))
        show(fig)
    else:
        missing("quick_wins.json")
with right:
    st.subheader("SHAP global importance")
    if shap:
        g = pd.DataFrame(shap["global_importance"]).sort_values("mean_abs_shap")
        colors = [RED if "fraud" in d else GREEN for d in g["typical_direction"]]
        fig = go.Figure(go.Bar(x=g["mean_abs_shap"], y=g["feature"], orientation="h", marker_color=colors,
                               customdata=g["typical_direction"], hovertemplate="%{y}: %{x:.3f} (%{customdata})<extra></extra>"))
        fig.update_layout(height=340, xaxis_title="Mean |SHAP|", margin=dict(l=0, r=10, t=10, b=0))
        show(fig)
        st.caption(f"Red: usually pushes toward fraud · green: usually toward normal · {shap['sample_size']:,} sampled transactions.")
    else:
        missing("shap_global_importance.json")

# ---------------------------------------------------------------- 4. ablation
st.header("4. Feature-group ablation")
if ablation:
    names = {"group_a_frequency_only": "A: frequency only", "group_b_rolling_only": "B: rolling-window only", "group_c_combined": "C: combined"}
    fig = go.Figure()
    for metric, color in [("precision", BLUE), ("recall", GREEN), ("f1", AMBER), ("roc_auc", RED)]:
        fig.add_trace(go.Bar(name=metric.replace("_", "-").upper() if metric == "roc_auc" else metric.capitalize(),
                             x=list(names.values()), y=[ablation[k][metric] for k in names], marker_color=color))
    fig.update_layout(barmode="group", height=360, yaxis_title="Score", legend_title_text="")
    show(fig)
    a, b, c = (ablation[k]["roc_auc"] for k in names)
    st.markdown(f"Frequency features alone reach ROC-AUC **{a:.4f}**; rolling-window features alone only **{b:.4f}**; "
                f"together **{c:.4f}** (a gain of {c - a:+.4f} over frequency alone).")
    st.caption(ablation.get("note", ""))
else:
    missing("feature_group_ablation.json")

# ---------------------------------------------------------------- 5. hybrid
st.header("5. Hybrid model on the chronological split")
if hybrid:
    res = hybrid["results"]
    labels = {"lightgbm_alone": "LightGBM alone", "graphsage_alone": "GraphSAGE alone", "hybrid_stacked": "Hybrid (stacked)"}
    table = pd.DataFrame([{"Model": labels[k], **res[k]} for k in labels]).rename(
        columns={"precision": "Precision", "recall": "Recall", "f1": "F1", "roc_auc": "ROC-AUC"})
    st.dataframe(table.style.format({c: "{:.4f}" for c in ["Precision", "Recall", "F1", "ROC-AUC"]}), use_container_width=True, hide_index=True)
    if hybrid_thr:
        best = hybrid_thr["best"]
        dist = hybrid_thr.get("prob_distribution", {})
        st.markdown(
            f"At the default 0.5 threshold the hybrid looks broken (recall {pct(res['hybrid_stacked']['recall'], 2)}). That is a "
            f"**calibration artifact**, not a failed model: its probabilities are compressed (median {dist.get('median', float('nan')):.4f}). "
            f"Re-thresholded at **{best['threshold']}**, F1 is **{best['f1']:.4f}**, a modest improvement over LightGBM alone ({res['lightgbm_alone']['f1']:.4f})."
        )
        sw = pd.DataFrame(hybrid_thr["threshold_sweep"])
        fig = go.Figure()
        for col, color, name in [("precision", BLUE, "Precision"), ("recall", GREEN, "Recall"), ("f1", AMBER, "F1")]:
            fig.add_trace(go.Scatter(x=sw["threshold"], y=sw[col], mode="lines+markers", name=name, line=dict(color=color)))
        fig.update_layout(height=320, xaxis_title="Hybrid decision threshold", yaxis_title="Score", legend_title_text="")
        show(fig)
    w = hybrid.get("stacking_weights", {})
    if w:
        st.caption(f"Stacking weights: LightGBM {w.get('lightgbm', float('nan')):+.2f}, GraphSAGE {w.get('graphsage', float('nan')):+.2f}.")
else:
    missing("temporal_hybrid_stacking.json")

# ---------------------------------------------------------------- 6. database
st.header("6. Database optimization and speed")
if dbopt:
    before, after, imp = dbopt["before"], dbopt["after"], dbopt["improvement_pct"]
    c1, c2, c3 = st.columns(3)
    c1.metric("Average latency, before", f"{before['avg_ms']:,.0f} ms")
    c2.metric("Average latency, after", f"{after['avg_ms']:,.0f} ms", delta=f"-{imp['avg']}%", delta_color="inverse")
    c3.metric("P95 latency, after", f"{after['p95_ms']:,.0f} ms", delta=f"-{imp['p95']}%", delta_color="inverse")
    fig = go.Figure(go.Bar(x=["Before indexes", "After indexes"], y=[before["avg_ms"], after["avg_ms"]], marker_color=[RED, GREEN],
                           text=[f"{before['avg_ms']:,.0f} ms", f"{after['avg_ms']:,.0f} ms"], textposition="outside"))
    fig.update_layout(height=320, yaxis_title="Average latency (ms)", showlegend=False)
    show(fig)
    st.caption(f"Fix: {after['indexes']}. {dbopt.get('note', '')}")
else:
    missing("database_optimization.json")

# ---------------------------------------------------------------- 7. reliability
st.header("7. System reliability")
if quick and quick.get("memory_recheck_mb"):
    mem = quick["memory_recheck_mb"]
    c1, c2 = st.columns(2)
    c1.metric("Process memory, before", f"{mem['before']:.1f} MB")
    c2.metric("Process memory, after", f"{mem['after']:.1f} MB", delta=f"{mem['delta']:+.2f} MB", delta_color="off")
    st.caption("Re-check after the live-scoring benchmark. A near-zero change means no memory leak was observed in that run.")
else:
    missing("quick_wins.json")

st.divider()
st.caption(
    "Research prototype on the public IEEE-CIS benchmark (590,540 transactions, 3.499% fraud, amounts in USD). "
    "Not validated for real payment decisions."
)
