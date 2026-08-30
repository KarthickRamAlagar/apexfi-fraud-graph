import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import streamlit as st

from style import apply_glassmorphism, apply_desktop_only_gate, render_sidebar_emblem

st.set_page_config(page_title="Model Evaluation — ApexFi Deep EDA", layout="wide")
apply_glassmorphism()
apply_desktop_only_gate()
render_sidebar_emblem()
st.title("Model Evaluation")
st.caption(
    "Real baseline-vs-model comparison, with real 3-seed statistical validation "
    "— not a single lucky run. Two separate models, one per dataset — see the "
    "note at the bottom for why they're not combined."
)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DATASETS = [("ieee_cis", "IEEE-CIS Transactions"), ("dgraph_fin", "DGraph-Fin Users")]
METRIC_KEYS = ["precision", "recall", "f1", "roc_auc", "pr_auc"]
METRIC_LABELS = {"precision": "Precision", "recall": "Recall", "f1": "F1", "roc_auc": "ROC-AUC", "pr_auc": "PR-AUC"}


def load_json(name):
    path = os.path.join(DATA_DIR, name)
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return None


for key, label in DATASETS:
    st.subheader(label)

    gnn_metrics = load_json(f"model_metrics_{key}.json")
    baseline_metrics = load_json(f"model_metrics_{key}_baseline.json")
    stacked_metrics = load_json(f"model_metrics_{key}_stacked.json")
    multiseed = load_json(f"multiseed_{key}.json")

    if not (gnn_metrics and baseline_metrics and stacked_metrics):
        st.warning(
            f"**Not fully trained yet.** Run the full pipeline for {key} "
            f"(baseline → GNN → stacking) — real numbers will appear here "
            f"automatically once those complete, no code change needed."
        )
        st.divider()
        continue

    # Headline: real multi-seed validated numbers for the winning model
    if multiseed:
        st.markdown("**Stacked model — real 3-seed validated result (the winner)**")
        stacked_summary = multiseed["stacked"]
        cols = st.columns(5)
        for i, mk in enumerate(METRIC_KEYS):
            m = stacked_summary[mk]
            cols[i].metric(METRIC_LABELS[mk], f"{m['mean']:.3f}", f"± {m['std']:.3f}")
        st.caption(
            f"Mean ± standard deviation across {len(multiseed['seeds'])} random seeds "
            f"— real statistical confidence, not a single run. {multiseed.get('note', '')}"
        )
    else:
        st.markdown("**Stacked model (single run — multi-seed validation not yet run)**")
        cols = st.columns(5)
        for i, mk in enumerate(METRIC_KEYS):
            cols[i].metric(METRIC_LABELS[mk], f"{stacked_metrics[mk]:.3f}")

    st.markdown("&nbsp;")
    st.markdown("**Real three-way comparison**")

    def row_for(name, single, seeded_key=None):
        if multiseed and seeded_key:
            s = multiseed[seeded_key]
            return {"Model": name, **{METRIC_LABELS[mk]: f"{s[mk]['mean']:.3f} ± {s[mk]['std']:.3f}" for mk in METRIC_KEYS}}
        return {"Model": name, **{METRIC_LABELS[mk]: f"{single[mk]:.3f}" for mk in METRIC_KEYS}}

    table_rows = [
        row_for("LightGBM alone (no graph)", baseline_metrics, seeded_key="lightgbm"),
        row_for("GNN alone", gnn_metrics),  # not multi-seeded — see note below
        row_for("Stacked (LightGBM + GNN) — winner", stacked_metrics, seeded_key="stacked"),
    ]
    st.table(table_rows)

    if stacked_metrics.get("learned_weight_lightgbm") is not None:
        lgbm_w = stacked_metrics["learned_weight_lightgbm"]
        gnn_w = stacked_metrics["learned_weight_gnn"]
        ratio = lgbm_w / gnn_w if gnn_w else float("inf")
        st.caption(
            f"**Learned stacking weights:** LightGBM={lgbm_w:.2f}, GNN={gnn_w:.2f} "
            f"(≈{ratio:.1f}:1). " + (
                "A heavily lopsided ratio here means the graph's independent "
                "contribution is small for this dataset — the tabular features "
                "already capture most of what matters."
                if ratio > 5 else
                "A near-balanced ratio here means the graph and tabular signals "
                "are genuinely complementary for this dataset — neither dominates."
            )
        )

    st.caption(
        "GNN alone is a single validated run, not multi-seeded — GNN training "
        "proved memory-intensive on available hardware, so multi-seed validation "
        "was scoped to the model that's actually deployed (the stacked ensemble), "
        "reusing one validated GNN checkpoint across all seed runs."
    )

    with st.expander("Confusion matrix (test set, stacked model)"):
        cm = stacked_metrics.get("confusion_matrix")
        if cm:
            st.table({"Predicted Normal": [cm[0][0], cm[1][0]], "Predicted Fraud": [cm[0][1], cm[1][1]]})
            st.caption("Rows: actual Normal, actual Fraud (top to bottom).")

    st.divider()

st.markdown("**Try it live — real inference on genuinely new, previously-unseen data:**")
_link_cols = st.columns(3)
with _link_cols[0]:
    st.link_button("Look up a real transaction", "http://localhost:5173/#/investigate")
with _link_cols[1]:
    st.link_button("Score a new IEEE-CIS transaction", "http://localhost:5173/#/score-new")
with _link_cols[2]:
    st.link_button("Score an unlabeled DGraph-Fin account", "http://localhost:5173/#/score-account")

st.caption(
    "**Why two models, not one:** IEEE-CIS transactions and DGraph-Fin users are "
    "separate real datasets with no shared join key — forcing them into one "
    "combined graph would mean inventing a connection that doesn't reflect "
    "anything real, so each is trained and evaluated independently."
)