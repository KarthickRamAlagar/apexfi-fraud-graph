import streamlit as st

from data_loader import snapshot_exists, load_summary, SNAPSHOT_MISSING_MESSAGE
from style import apply_glassmorphism, render_sidebar_emblem

st.set_page_config(page_title="ApexFi — Deep EDA", layout="wide", page_icon="🕸️")
apply_glassmorphism()
render_sidebar_emblem()

st.title("ApexFi — Deep EDA")
st.caption(
    "Full-column profiling and raw data browsing across the real Gold layer. "
    "This is a snapshot, refreshed periodically — not a live database connection "
    "(see the note at the bottom of this page)."
)

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
st.subheader("Model Evaluation")
st.page_link("pages/3_Model_Evaluation.py", label="View model evaluation summary →")

st.divider()
st.caption(
    "**About this snapshot:** Full per-column statistics (mean, std, min, max, "
    "missing %) are computed from the complete real dataset. Raw row browsing "
    "uses a 50,000-row representative sample, not all 590K/3.7M rows — this "
    "keeps the app fast and its files small enough to deploy, while headline "
    "statistics above stay accurate to the full data. Re-exported periodically "
    "via `backend/services/export_snapshot.py`, not a live query."
)
