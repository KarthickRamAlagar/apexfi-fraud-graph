"""Builds a feature vector for a genuinely NEW transaction (not in the
training data), using the saved preprocessing artifacts from
build_preprocessing_artifacts.py — never recomputing frequency tables or
category mappings from scratch, which would either be impossible for a
single new transaction or reintroduce data leakage.

Any raw field the user doesn't provide (most of the 400+ V/C/D columns —
we only expose the meaningful subset in the form) falls back to the same
default the training pipeline used for missing values.
"""
import numpy as np


def build_feature_vector(raw_input: dict, artifacts: dict, real_degree_counts: dict = None) -> np.ndarray:
    """raw_input: dict of user-provided fields, e.g.
    {"transactionamt": 250.0, "productcd": "W", "card1": 12345, ...}
    Unprovided fields fall back to training-consistent defaults.

    real_degree_counts: optional {"device_shared_degree": N, "card_shared_degree": N}
    — the REAL counts found by the Stage 2 graph lookup (see
    new_transaction_graph_scorer.py). Without this, degree features
    default to 0, which is WRONG whenever real connections exist — a
    real bug this parameter fixes (previously always hardcoded to 0,
    even when Stage 2 had already found real matched neighbors).

    Returns a 1D numpy array in the exact column order the trained
    models expect (artifacts["full_feature_order"]).
    """
    values = {}

    # 1. Raw/categorical columns — the bulk of the feature set
    for col in artifacts["raw_feature_cols"]:
        if col in artifacts["categorical_cols"]:
            # label-encoded categorical: look up the training-time code;
            # a genuinely unseen category (or one the user didn't
            # provide) falls back to whatever code "__missing__" got
            # assigned during training — the same bucket training used
            # for actual missing values, a consistent, defensible choice
            mapping = artifacts["categorical_mappings"].get(col, {})
            raw_val = raw_input.get(col)
            if raw_val is None or str(raw_val) not in mapping:
                values[col] = mapping.get("__missing__", 0)
            else:
                values[col] = mapping[str(raw_val)]
        elif col in artifacts["m_cols"]:
            # M1-M9 booleans: True/False/missing -> 1/0/-1, same as training
            raw_val = raw_input.get(col)
            if raw_val is True:
                values[col] = 1
            elif raw_val is False:
                values[col] = 0
            else:
                values[col] = -1
        else:
            # plain numeric passthrough (TransactionAmt, card2, addr1,
            # V1-V339, C1-C14, D1-D15, etc.) — use the provided value, or
            # the training-consistent default (0) if not provided
            raw_val = raw_input.get(col)
            values[col] = float(raw_val) if raw_val is not None else artifacts["defaults"].get(col, 0)

    # 2. Frequency-encoded columns — real lookup against the TRAINING
    # frequency table, log1p-scaled to match the graph builder exactly
    # (build_ieee_cis_graph_data.py applies log1p to these features —
    # confirmed by direct comparison against the current, freshly and
    # consistently rebuilt graph.pt).
    for freq_name in artifacts["freq_feature_names"]:
        base_col = freq_name.replace("_freq", "")
        raw_val = raw_input.get(base_col)
        table = artifacts["frequency_tables"].get(base_col, {})
        count = table.get(raw_val, 0) if raw_val is not None else 0
        values[freq_name] = float(np.log1p(count))

    # 3. Degree features — use REAL counts from Stage 2's graph lookup
    # when available (real matched neighbors, exactly as the model was
    # trained to expect). Only defaults to 0 when no lookup has been run
    # at all — an honest fallback, not the normal path.
    real_degree_counts = real_degree_counts or {}
    for degree_name in artifacts["degree_feature_names"]:
        values[degree_name] = float(real_degree_counts.get(degree_name, 0.0))

    # Build the final vector in the EXACT saved order — this is what
    # guarantees the model receives features in the same arrangement it
    # was trained on
    vector = np.array([values[col] for col in artifacts["full_feature_order"]], dtype=np.float32)
    return vector.reshape(1, -1)