import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import streamlit as st

from data_loader import snapshot_exists, load_sample, SNAPSHOT_MISSING_MESSAGE
from style import apply_glassmorphism, apply_desktop_only_gate, render_sidebar_emblem

st.set_page_config(page_title="Raw Data Browser — ApexFi Deep EDA", layout="wide")
apply_glassmorphism()
apply_desktop_only_gate()
render_sidebar_emblem()
st.title("Raw Data Browser")

if not snapshot_exists():
    st.error(SNAPSHOT_MISSING_MESSAGE)
    st.stop()

TABLE_LABELS = {"ieee_cis_features": "IEEE-CIS Transactions", "dgraph_fin_nodes": "DGraph-Fin Users"}
table = st.selectbox("Dataset", list(TABLE_LABELS), format_func=lambda t: TABLE_LABELS[t])

df = load_sample(table)
st.caption(
    f"Real {len(df):,}-row representative sample (not the full "
    f"{'590,540' if table == 'ieee_cis_features' else '3,700,550'} rows — see the note on the Home page)."
)

with st.expander("Filters", expanded=True):
    filtered = df.copy()

    if table == "ieee_cis_features":
        col1, col2, col3 = st.columns(3)
        with col1:
            fraud_only = st.selectbox("Fraud status", ["All", "Fraud only", "Normal only"])
        with col2:
            products = []
            if "productcd" in df.columns:
                products = st.multiselect("Product code", sorted(df["productcd"].dropna().unique()))
        with col3:
            amt_range = None
            if "transactionamt" in df.columns:
                min_amt, max_amt = float(df["transactionamt"].min()), float(df["transactionamt"].max())
                amt_range = st.slider("Transaction amount (INR)", min_amt, max_amt, (min_amt, max_amt))

        if fraud_only == "Fraud only":
            filtered = filtered[filtered["is_fraud"]]
        elif fraud_only == "Normal only":
            filtered = filtered[~filtered["is_fraud"]]
        if products:
            filtered = filtered[filtered["productcd"].isin(products)]
        if amt_range:
            filtered = filtered[filtered["transactionamt"].between(*amt_range)]

    elif table == "dgraph_fin_nodes":
        col1, col2 = st.columns(2)
        with col1:
            labels = []
            if "label" in df.columns:
                labels = st.multiselect("Label", sorted(df["label"].dropna().unique()))
        with col2:
            degree_range = None
            if "total_degree" in df.columns:
                min_d, max_d = int(df["total_degree"].min()), int(df["total_degree"].max())
                degree_range = st.slider("Total degree", min_d, max_d, (min_d, max_d))

        if labels:
            filtered = filtered[filtered["label"].isin(labels)]
        if degree_range:
            filtered = filtered[filtered["total_degree"].between(*degree_range)]

st.caption(f"{len(filtered):,} of {len(df):,} sampled rows match your filters.")
st.dataframe(filtered, use_container_width=True, height=500)

st.download_button(
    "Download filtered rows as CSV",
    filtered.to_csv(index=False).encode("utf-8"),
    file_name=f"{table}_filtered.csv",
    mime="text/csv",
)
