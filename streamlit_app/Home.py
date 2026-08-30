import streamlit as st

from data_loader import snapshot_exists, load_summary, SNAPSHOT_MISSING_MESSAGE
from style import apply_glassmorphism, apply_desktop_only_gate, render_sidebar_emblem

st.set_page_config(page_title="ApexFi — Deep EDA", layout="wide", page_icon="🕸️")
apply_glassmorphism()
apply_desktop_only_gate()
render_sidebar_emblem()

st.title("ApexFi — Deep EDA")
st.caption(
    "Full-column profiling and raw data browsing across the real Gold layer. "
    "This is a snapshot, refreshed periodically — not a live database connection "
    "(see the note at the bottom of this page)."
)

st.markdown(
    """
**What ApexFi solves:** Real-time, explainable fraud detection for India's
UPI/IMPS digital payment rails, combining a tabular gradient-boosted model
(LightGBM) with a graph neural network (GraphSAGE) that learns from real
transaction-sharing patterns — shared devices, shared cards — that a purely
tabular model can't see on its own. Beyond retrospective analysis, the live
web app can score a genuinely new, previously-unseen transaction or account
in real time — not just look up ones already in the training data.
"""
)

with st.expander("SDG alignment"):
    st.markdown(
        """
- **SDG 16 (Peace, Justice and Strong Institutions), Target 16.4** — reducing
  illicit financial flows and combating financial crime. Fraud detection for
  a national payment system is a direct application of this target.
- **SDG 9 (Industry, Innovation and Infrastructure), Target 9.5** — enhancing
  technological capability through real applied research on critical digital
  infrastructure (UPI/IMPS).
- **SDG 8 (Decent Work and Economic Growth), Target 8.10** — secondary
  contribution: strengthening trust in domestic financial institutions
  supports continued financial inclusion.
"""
    )

st.divider()

if not snapshot_exists():
    st.error(SNAPSHOT_MISSING_MESSAGE)
    st.stop()

col1, col2 = st.columns(2)

with col1:
    st.subheader("IEEE-CIS Transactions")
    summary = load_summary("eda_ieee_cis")
    if summary:
        st.metric("Rows", f"{summary['rows']:,}")
        st.metric("Total columns", summary["totalColumns"])
        st.metric("Real fraud rate", "3.499%")
    st.page_link("pages/1_Full_Profiling.py", label="Full column profiling →")
    st.page_link("pages/2_Raw_Data_Browser.py", label="Browse raw sample rows →")

with col2:
    st.subheader("DGraph-Fin Users")
    summary = load_summary("eda_dgraph_fin")
    if summary:
        st.metric("Rows", f"{summary['rows']:,}")
        st.metric("Total columns", summary["totalColumns"])
        st.metric("Real fraud rate (labeled)", "1.265%")
    st.page_link("pages/1_Full_Profiling.py", label="Full column profiling →")
    st.page_link("pages/2_Raw_Data_Browser.py", label="Browse raw sample rows →")

st.divider()
st.subheader("Overall Model Evaluation")

import json
import os

_data_dir = os.path.join(os.path.dirname(__file__), "data")
_summary_cols = st.columns(2)
_any_metrics = False

for _i, (_key, _label) in enumerate([("ieee_cis", "IEEE-CIS (stacked model)"), ("dgraph_fin", "DGraph-Fin (stacked model)")]):
    _path = os.path.join(_data_dir, f"multiseed_{_key}.json")
    with _summary_cols[_i]:
        st.markdown(f"**{_label}**")
        if os.path.exists(_path):
            _any_metrics = True
            with open(_path) as f:
                _d = json.load(f)
            _s = _d["stacked"]
            st.metric("F1", f"{_s['f1']['mean']:.3f}", f"± {_s['f1']['std']:.3f}")
            st.metric("ROC-AUC", f"{_s['roc_auc']['mean']:.3f}")
        else:
            st.caption("Not yet validated — see Model Evaluation page.")

if _any_metrics:
    st.caption("Real, 3-seed cross-validated numbers — full breakdown (vs. LightGBM alone and GNN alone) on the Model Evaluation page.")

st.page_link("pages/3_Model_Evaluation.py", label="Full model evaluation breakdown →")

st.divider()
st.caption(
    "**About this snapshot:** Full per-column statistics (mean, std, min, max, "
    "missing %) are computed from the complete real dataset. Raw row browsing "
    "uses a 50,000-row representative sample, not all 590K/3.7M rows — this "
    "keeps the app fast and its files small enough to deploy, while headline "
    "statistics above stay accurate to the full data. Re-exported periodically "
    "via `backend/services/export_snapshot.py`, not a live query."
)