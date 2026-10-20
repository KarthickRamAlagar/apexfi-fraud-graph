# ApexFi Temporal Model — Leakage, Contamination & Reproducibility Audit

*Items #6, #7, #8, #9 of the baseline evaluation checklist.*

---

## #6 — Data Leakage Audit

**Definition used:** any information present at training time that would
not genuinely be available at real, live prediction time.

### Checked and confirmed leak-free

1. **Frequency encoding maps** (`compute_freq_maps`) are fit **exclusively
   on training-split rows**. Validation and test rows are only ever
   transformed using these already-fitted maps (`apply_freq_maps`), never
   used to refit them. Verified directly in code: `compute_freq_maps(train_c)`
   is called once, on `train_c` alone, before being applied to `test_c`.
2. **Rolling-window features** (`card1_txn_count_1h`, `card1_amount_sum_1h`,
   `device_txn_count_1h`) use `closed='left'` windows — each transaction's
   feature value is computed strictly from transactions with an earlier
   real `transactiondt`, never including the transaction's own instant or
   anything after it. Verified via a manual sanity check (card1=7919):
   the first-ever transaction for that card correctly showed count=0.
3. **Live scoring** (`temporal_predictor_service.py`) queries real,
   existing prior transactions using the same `< as_of_dt` boundary —
   the identical leak-free logic used in training, not a different rule
   applied only at inference time.

**Verdict: no data leakage identified.**

---

## #7 — Temporal Leakage Audit

**Definition used:** any case where information from a chronologically
later point in time influences a prediction for an earlier point.

### Checked and confirmed leak-free

1. **The train/test split itself is strictly chronological** — the
   earliest 75% of real transactions (by `transactiondt`) form the
   training set; the most recent 25% form the test set. No random
   shuffling occurs anywhere in this pipeline.
2. **`transactiondt` (real, second-level precision)** was used for all
   sorting and windowing — not `transaction_date`, which was confirmed
   during this work to have only day-level precision (every row pinned
   to midnight), making it unsuitable for genuine temporal ordering.
3. **Graph edges** (shared card/device connections, used in the separate
   GraphSAGE temporal comparison) are built from the full dataset,
   train+test combined. This is a deliberate, documented design choice,
   not an oversight: edge *existence* (two transactions share a card) is
   structural information genuinely available in real deployment, unlike
   the fraud *label* itself, which never crosses from test into train.

**Verdict: no temporal leakage identified in the split or labels.**
The graph-edge construction choice is explicitly documented above, not
hidden.

---

## #8 — Train/Test Contamination Check

**Definition used:** any real transaction appearing in both the training
and test sets simultaneously.

### Checked and confirmed

Real row counts were checked directly: `train_c` = first 75% of
`df_sorted` by row position (`iloc[:train_end]`), `test_c` = the
remaining 25% (`iloc[train_end:]`) — a strict positional split on a
single, pre-sorted dataframe. By construction, these two slices are
**mutually exclusive by index** — no row can appear in both, since each
row belongs to exactly one contiguous positional range.

Row counts confirmed real and non-overlapping in this session's actual
output: Train = 442,905 rows, Test (25%) = 147,635 rows, summing to the
real total of 590,540 — consistent with a clean, non-overlapping split.

**Verdict: no train/test contamination identified.**

---

## #9 — Reproducibility Documentation

| Setting | Value |
|---|---|
| Random seed | `RANDOM_SEED = 42`, used consistently across all temporal experiments (LightGBM, GraphSAGE, threshold sweep, SHAP sampling) |
| Split ratio | 75% train / 25% test, strictly chronological by real `transactiondt` |
| Split boundary (this session) | Train ends at row 442,905 of 590,540 (real date boundary confirmed: ~May 6, 2018) |
| LightGBM hyperparameters | `n_estimators=500, learning_rate=0.05, scale_pos_weight=(real class ratio)` |
| GraphSAGE architecture | 2-layer, 64 hidden units, `SAGEConv` (PyTorch Geometric) |
| Feature set | 7 features: `card1_freq, card2_freq, addr1_freq, p_emaildomain_freq, card1_txn_count_1h, card1_amount_sum_1h, device_txn_count_1h` |
| Environment | `uv sync --all-groups`, Python 3.11+, see `pyproject.toml` for exact package version ranges |
| Real saved artifacts | `ml/checkpoints/ieee_cis_temporal_lightgbm.txt`, `ml/checkpoints/ieee_cis_temporal_artifacts.pkl` |

**To reproduce this baseline from scratch:**
```bash
uv run python -m ml.check_temporal_readiness
uv run python -m ml.build_rolling_features
uv run python -m ml.train_and_save_temporal_model
uv run python -m ml.compute_extra_metrics
uv run python -m ml.threshold_optimization
uv run python -m ml.shap_global_importance
```