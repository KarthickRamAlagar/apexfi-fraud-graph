import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import streamlit as st

from style import apply_glassmorphism, render_sidebar_emblem

st.set_page_config(page_title="Model Evaluation — ApexFi Deep EDA", layout="wide")
apply_glassmorphism()
render_sidebar_emblem()
st.title("Model Evaluation")
st.caption(
    "Summary only — the full evaluation dashboard (ROC/PR curves, confusion "
    "matrix, per-transaction GNNExplainer breakdowns) lives in the ApexFi web "
    "app's Model Output page. This page is a compact snapshot for the deep "
    "EDA experience."
)

METRICS_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "model_metrics.json")


def load_metrics():
    if os.path.exists(METRICS_PATH):
        with open(METRICS_PATH) as f:
            return json.load(f)
    return None


metrics = load_metrics()

if metrics is None:
    st.warning(
        "**Model not yet trained.** Real accuracy/precision/recall/F1/AUC will "
        "appear here automatically once training completes and "
        "`data/model_metrics.json` is exported — no code change needed then, "
        "just re-run the export."
    )
    st.info(
        "Once training finishes, real numbers will show here as a compact "
        "summary — the same figures shown in full detail on the ApexFi web app."
    )
else:
    col1, col2, col3, col4, col5 = st.columns(5)
    col1.metric("Accuracy", f"{metrics['accuracy']:.3f}")
    col2.metric("Precision", f"{metrics['precision']:.3f}")
    col3.metric("Recall", f"{metrics['recall']:.3f}")
    col4.metric("F1 Score", f"{metrics['f1']:.3f}")
    col5.metric("ROC-AUC", f"{metrics['roc_auc']:.3f}")
    st.caption(f"Trained on: {metrics.get('trained_at', 'unknown date')}")
    st.link_button("View full evaluation dashboard in the ApexFi web app", metrics.get("web_app_url", "#"))
