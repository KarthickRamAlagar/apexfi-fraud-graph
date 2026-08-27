"""Loads the Parquet/JSON snapshot (see backend/services/export_snapshot.py).
Cached with st.cache_data so switching between pages doesn't re-read files
from disk every time — loaded once per session.
"""
import json
import os

import pandas as pd
import streamlit as st

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

SNAPSHOT_MISSING_MESSAGE = (
    "No data snapshot found. Run this once from the project root:\n\n"
    "```\nuv run python -m backend.services.export_snapshot\n```"
)


def snapshot_exists():
    return os.path.isdir(DATA_DIR) and len(os.listdir(DATA_DIR)) > 0


@st.cache_data
def load_column_stats(table):
    path = os.path.join(DATA_DIR, f"{table}_column_stats.parquet")
    return pd.read_parquet(path)


@st.cache_data
def load_sample(table):
    path = os.path.join(DATA_DIR, f"{table}_sample.parquet")
    return pd.read_parquet(path)


@st.cache_data
def load_table(table):
    path = os.path.join(DATA_DIR, f"{table}.parquet")
    return pd.read_parquet(path)


@st.cache_data
def load_summary(key):
    path = os.path.join(DATA_DIR, f"summary_{key}.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)
