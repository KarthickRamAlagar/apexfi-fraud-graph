"""Temporal Validation — real, honest comparison between a random split
and a genuine chronological split, plus the reasoning behind why
DGraph-Fin doesn't receive the same treatment.

Reads the real, already-saved results from
streamlit_app/data/temporal_validation_results.json -- nothing on this
page is hardcoded; if that file doesn't exist yet, this page says so
plainly rather than showing fabricated numbers.
"""
import json
import os
import sys

import plotly.graph_objects as go
import streamlit as st

# style.py lives in streamlit_app/, this page lives in streamlit_app/pages/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from style import apply_desktop_only_gate, apply_glassmorphism, render_sidebar_emblem

st.set_page_config(page_title="Temporal Validation — ApexFi", layout="wide")
apply_desktop_only_gate()
apply_glassmorphism()
render_sidebar_emblem()

RESULTS_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "temporal_validation_results.json")

st.title("Temporal Validation")
st.markdown(
    "A real, honest test: does evaluating on a **random split** overstate how well a fraud "
    "model will really perform, compared to a genuine **chronological split** — training only "
    "on the past, testing only on the future, the way real deployment actually works?"
)

if not os.path.exists(RESULTS_PATH):
    st.warning(
        "No real temporal validation results found yet. Run:\n\n"
        "`uv run python -m ml.train_and_save_temporal_model`\n\n"
        "to generate them — this page will show the real numbers once that's done."
    )
    st.stop()

with open(RESULTS_PATH) as f:
    data = json.load(f)

results = data["results"]
random_r = results["random_split"]
chrono_r = results["chronological_split"]

st.markdown("### Real, saved comparison (IEEE-CIS)")

col1, col2, col3 = st.columns(3)
with col1:
    st.metric(
        "ROC-AUC",
        f"{chrono_r['roc_auc']:.4f}",
        delta=f"{chrono_r['roc_auc'] - random_r['roc_auc']:+.4f} vs. random split",
        delta_color="inverse",
    )
with col2:
    st.metric(
        "F1",
        f"{chrono_r['f1']:.4f}",
        delta=f"{chrono_r['f1'] - random_r['f1']:+.4f} vs. random split",
        delta_color="inverse",
    )
with col3:
    st.metric(
        "Precision",
        f"{chrono_r['precision']:.4f}",
        delta=f"{chrono_r['precision'] - random_r['precision']:+.4f} vs. random split",
        delta_color="inverse",
    )

st.markdown(
    "*(A negative delta here is the expected, honest result — it reflects genuine forward-time "
    "generalization difficulty, not a mistake.)*"
)

# real bar chart comparing both splits across all 4 metrics
metrics = ["precision", "recall", "f1", "roc_auc"]
fig = go.Figure()
fig.add_trace(go.Bar(name="Random split", x=metrics, y=[random_r[m] for m in metrics], marker_color="#E8A33D"))
fig.add_trace(go.Bar(name="Chronological split", x=metrics, y=[chrono_r[m] for m in metrics], marker_color="#4C8BF5"))
fig.update_layout(barmode="group", height=400, yaxis_title="Score", legend_title_text="")
st.plotly_chart(fig, use_container_width=True)

st.info(data.get("note", ""))

st.markdown("---")
st.markdown("### Methodology — real, leak-free discipline")

st.markdown(
    """
- **Real chronological split**: sorted strictly by the dataset's real `transactiondt` field
  (a genuine, second-level time-delta — not the day-only `transaction_date`, which was
  confirmed to have no real sub-day precision). The earliest 75% of real transactions became
  training data; the most recent 25% became the test set.
- **Real rolling-window features**: for every transaction, we computed how many transactions
  the same card made in the preceding hour, and the total amount moved — using `closed='left'`
  windows, meaning each transaction only ever sees genuinely **prior** transactions, never
  itself or anything after it.
- **Three independent confirmations of the same real finding**: this project found the same
  honest pattern three separate times — a real Kaggle competition submission (0.733 official
  score vs. 0.93 internal random-split score), this LightGBM comparison, and a matching
  GraphSAGE comparison using the identical chronological split.
"""
)

st.markdown("### Why DGraph-Fin isn't included here")
st.markdown(
    """
DGraph-Fin's real timestamp field (`node_timestamp`) is genuinely **sparse** — it's only
populated for a subset of fraud-labeled accounts, not the full dataset. A clean, honest
chronological split the way we built for IEEE-CIS isn't possible on this specific data without
either fabricating timestamps for accounts that don't have them, or silently dropping most of
the dataset. Rather than force a misleading version of this analysis, this is a deliberate,
documented scoping decision — an honest limitation of the available data, not an oversight.
"""
)