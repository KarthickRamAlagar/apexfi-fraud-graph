import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pandas as pd
import plotly.express as px
import streamlit as st

from data_loader import snapshot_exists, load_column_stats, load_sample, SNAPSHOT_MISSING_MESSAGE
from style import apply_glassmorphism, render_sidebar_emblem

st.set_page_config(page_title="Full Profiling — ApexFi Deep EDA", layout="wide")
apply_glassmorphism()
render_sidebar_emblem()
st.title("Full Column Profiling")
st.caption(
    "Every column, not just the curated set shown on the main ApexFi dashboard — "
    "real mean/std/min/max/missing % computed from the complete dataset."
)

if not snapshot_exists():
    st.error(SNAPSHOT_MISSING_MESSAGE)
    st.stop()

TABLE_LABELS = {"ieee_cis_features": "IEEE-CIS Transactions", "dgraph_fin_nodes": "DGraph-Fin Users"}
table = st.selectbox("Dataset", list(TABLE_LABELS), format_func=lambda t: TABLE_LABELS[t])

stats_df = load_column_stats(table)
sample_df = load_sample(table)

st.subheader(f"All {len(stats_df)} columns")

# missing-value overview across every column, sorted worst-first — this is
# the thing that's genuinely hidden by the curated 4-column view
fig = px.bar(
    stats_df.sort_values("missing_pct", ascending=False).head(40),
    x="column", y="missing_pct",
    title="Missing % by column (worst 40 shown)",
    labels={"missing_pct": "Missing %", "column": ""},
)
fig.update_layout(height=350, xaxis_tickangle=-60)
st.plotly_chart(fig, use_container_width=True)

st.dataframe(
    stats_df.style.format({"missing_pct": "{:.2f}%", "mean": "{:.3f}", "std": "{:.3f}", "min": "{:.3f}", "max": "{:.3f}"}, na_rep="—"),
    use_container_width=True,
    height=350,
)

st.divider()
st.subheader("Column deep-dive")
search = st.text_input("Search for a column (e.g. 'v15', 'card', 'transactionamt')", "")
matches = stats_df[stats_df["column"].str.contains(search, case=False, na=False)] if search else stats_df
selected_col = st.selectbox("Pick a column", matches["column"].tolist())

if selected_col:
    row = stats_df[stats_df["column"] == selected_col].iloc[0]
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Missing %", f"{row['missing_pct']:.2f}%")
    if row["is_numeric"]:
        c2.metric("Mean", f"{row['mean']:.3f}" if pd.notna(row["mean"]) else "—")
        c3.metric("Std", f"{row['std']:.3f}" if pd.notna(row["std"]) else "—")
        c4.metric("Min", f"{row['min']:.3f}" if pd.notna(row["min"]) else "—")
        c5.metric("Max", f"{row['max']:.3f}" if pd.notna(row["max"]) else "—")

        if selected_col in sample_df.columns:
            fig = px.histogram(
                sample_df, x=selected_col, nbins=40,
                title=f"{selected_col} distribution (from {len(sample_df):,}-row sample)",
            )
            fig.update_layout(height=350)
            st.plotly_chart(fig, use_container_width=True)
    else:
        st.caption("Non-numeric column — showing value counts from the sample instead.")
        if selected_col in sample_df.columns:
            counts = sample_df[selected_col].value_counts().head(20)
            fig = px.bar(x=counts.index, y=counts.values, labels={"x": selected_col, "y": "Count"})
            fig.update_layout(height=350)
            st.plotly_chart(fig, use_container_width=True)
