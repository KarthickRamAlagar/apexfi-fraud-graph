# ApexFi — UPI/IMPS Cross-Channel Fraud Detection

M.Tech project — a hybrid fraud-detection system combining tabular gradient
boosting (LightGBM) with a Graph Neural Network (GraphSAGE), stacked
together and made explainable with SHAP and real graph context. Built
around a full data engineering pipeline, a FastAPI + React web app, and a
Streamlit deep-EDA app.

**Framing note:** actual large-scale UPI/IMPS transaction data isn't
publicly available, so this project uses two real-world proxy datasets —
**IEEE-CIS** (transaction-level fraud) and **DGraph-Fin** (account/network-
level fraud) — to build and validate an architecture aimed at the real
UPI/IMPS cross-channel fraud problem. These are genuine, structurally
representative datasets, not literal UPI transaction logs, and this project
does not claim otherwise.

**Live resources:**
- Trained models on Hugging Face Hub: https://huggingface.co/karthifde/apexfi-fraud-detection
- Reproducible Kaggle notebook: https://www.kaggle.com/code/karthifde/notebookd612b11733
- DGraph-Fin dataset on Kaggle: https://www.kaggle.com/datasets/karthifde/dgraph-fin-fraud-detection-network-data

---

## What's actually built

- **ETL pipeline** — Bronze → Silver → Gold, in PostgreSQL, for IEEE-CIS and
  DGraph-Fin (their own primary, fetched datasets). A handful of small
  supplementary parquet files (RBI money rates, NPCI digital-payments
  volumes) are also included for one Analytics chart's context — these are
  minor, supplementary reference data, not primary ETL sources with their
  own Bronze/Silver/Gold pipeline.
- **Two independently trained models, one per dataset** — IEEE-CIS and
  DGraph-Fin are *not* artificially joined (no genuine shared identity
  exists between a transaction and a DGraph-Fin account), so each dataset
  gets its own LightGBM + GraphSAGE + stacking pipeline, trained and
  validated separately.
- **Real, 3-seed statistically validated results** — a fixed stratified
  70/15/15 train/val/test split, repeated across 3 random seeds, with
  mean ± standard deviation reported (not k-fold cross-validation — the
  split itself stays fixed; only the model's own training randomness
  varies across seeds).
- **Explainability** — SHAP (`TreeExplainer`) for per-prediction feature
  attribution, plus real graph context (actual matched neighbors, not
  approximated). Note: **not** GNNExplainer — SHAP against the LightGBM
  component, combined with the real graph neighbor lookup, is what
  actually ships.
- **Three real inference features**, exposed through the web app:
  - **Investigate** — retrospective lookup of a transaction already in
    the training data
  - **Score New Transaction** (IEEE-CIS) — genuine forward inference on a
    transaction that has never existed anywhere, using saved,
    training-derived preprocessing artifacts (never recomputed on new
    data, to avoid leakage) and real dynamic graph-neighbor lookup
  - **Score Unlabeled Account** (DGraph-Fin) — scores real, existing
    "background" accounts (2.47M of DGraph-Fin's 3.7M total) whose true
    fraud status was never labeled in the source data — a genuinely
    unknown outcome, not a synthetic reconstruction (DGraph-Fin's edges
    are direct, pre-existing account relationships, so there's no honest
    way to simulate connections for a hypothetical new account)
- **Ask Your Data** — real text-to-SQL over the Gold layer, with an LLM
  provider fallback chain (OpenAI → Groq → Mistral → OpenRouter →
  Cerebras).
- **A working web app** — React + Vite frontend, FastAPI backend, models
  loaded once (singleton) and never retrained from live input by design.

**On model updates:** the system deliberately does **not** learn from new
user input — every prediction runs through the same, fixed, already-
validated model files. This is intentional, production-oriented design,
not a limitation. Genuine future improvement would mean a separate,
controlled periodic retraining pipeline using verified, labeled outcomes.

---

## Third, independent experiment: Ethereum blockchain fraud

A separate, standalone validation of the same explainable methodology
(leak-free feature engineering, LightGBM, SHAP) on a structurally
different real-world domain — real Ethereum blockchain accounts, not UPI
transactions or DGraph-Fin's account network.

**Deliberately not merged into the main pipeline** — blockchain and UPI
are genuinely different payment systems with no real shared identity.
This is a third, independent proof point that the same methodology
generalizes, not a technical integration.

- **Dataset:** "Ethereum Fraud Detection Dataset" (Kaggle, vagifa) — 9,841
  real Ethereum accounts, real `FLAG` label, 22.14% real fraud rate
- **Real test-set results:** Precision 0.9502, Recall 0.9327, F1 0.9414,
  ROC-AUC 0.9933, PR-AUC 0.9834
- **Exposed through its own web app page**, reusing the main project's
  established UI patterns

**Why the numbers are so much higher here — an honest note:** this is a
smaller, more balanced, and more inherently separable problem than
IEEE-CIS or DGraph-Fin (22% fraud vs. 3.5%/1.27%; ~9.8K accounts vs.
590K/3.7M), not evidence of a better model. It demonstrates the same
proven approach working cleanly a third time, on a third kind of data.

---

## Temporal Validation: does a random split overstate real performance?

A real, targeted follow-up investigation (on the `temporal-validation`
branch): does evaluating on a **random split** make a fraud model look
better than it would genuinely perform in real deployment, where you only
ever have the past to predict the future?

### The real, honest finding — confirmed three independent ways

| Confirmation | Random / internal split | Genuine chronological / temporal split |
|---|---|---|
| Real Kaggle competition submission | 0.93 (internal random-split test) | **0.733** (official competition score) |
| LightGBM, this project's own re-test | 0.8463 ROC-AUC | **0.7898** ROC-AUC |
| GraphSAGE, this project's own re-test | 0.7095 ROC-AUC | **0.7030** ROC-AUC |

All three point the same direction: **a random split genuinely overstates
real-world performance relative to honest, forward-time evaluation.**
This isn't a one-off result — it showed up independently in a real
external competition submission and in two separately retrained models
on our own chronological split.

### A genuinely interesting, honestly-reported nuance

The **GraphSAGE gap (0.7095 → 0.7030, a drop of ~0.0065) is far smaller**
than the **LightGBM gap (0.8463 → 0.7898, a drop of ~0.057)**. We do not
claim certainty about why — two honest, plausible explanations, neither
overclaimed:

1. This experiment's GNN uses a smaller, simplified feature set than
   LightGBM's comparison, so it may simply have less signal to lose when
   the split gets harder.
2. A genuinely interesting possibility: relational structure (who shares
   a card/device with whom) may be more *stable* over time than tabular
   feature distributions are — fraud tactics and spending patterns can
   shift month to month, but a real shared-device connection is a more
   fixed, structural fact. If true, this would be a legitimate research
   finding in its own right, not yet independently confirmed.

### Real methodology

- **Real chronological split**: sorted strictly by IEEE-CIS's real
  `transactiondt` field (a genuine, second-level time-delta — not the
  day-only `transaction_date`, which was confirmed during this work to
  have no real sub-day precision, every row pinned to midnight). Earliest
  75% of real transactions → train; most recent 25% → test.
- **Real, leak-free rolling-window features**: for every transaction, how
  many transactions the same card made in the preceding hour, and the
  total amount moved — using `closed='left'` windows, so a transaction
  only ever sees genuinely prior transactions, never itself or anything
  after it.
- **A real, saved, live-servable model**: the chronological-split
  LightGBM model (not the optimistic random-split version) is saved and
  exposed through a real "Score New Transaction (Temporal Model)" feature
  in the web app — genuine, live-queried rolling-window history from the
  database, not hardcoded values, scored as of the dataset's own real
  current "now."

### Why DGraph-Fin isn't included in this analysis

DGraph-Fin's real timestamp field (`node_timestamp`) is genuinely
**sparse** — only populated for a subset of fraud-labeled accounts, not
the full dataset. A clean, honest chronological split isn't possible on
this data without fabricating timestamps or dropping most of the dataset.
This is a **deliberate, documented scoping decision** — a real, honest
limitation of the available data, not an oversight. (See the Streamlit
app's Temporal Validation page for the same note, alongside the real
results.)

---

## Folder layout (current)

```
upi-fraud-gnn/
├── data/                     # local data lake (gitignored except .gitkeep)
│   ├── raw_downloads/
│   ├── bronze/
│   ├── silver/
│   └── gold/
├── etl/
│   ├── extract/               # one fetch script per data source
│   ├── load/                  # loads extracted data into Bronze
│   ├── transform/              # Bronze->Silver, Silver->Gold
│   └── db/                      # connection.py, schema.sql
├── streamlit_app/                 # standalone deep-EDA app (Streamlit Community Cloud)
│   ├── pages/                       # Full Profiling, Raw Data Browser, Model Evaluation,
│   │                                  # Temporal Validation
│   └── data/                          # precomputed snapshots (parquet/json), regenerate via
│                                        # backend.services.export_snapshot when missing
├── backend/                             # FastAPI app
│   ├── routers/                           # dashboard, datasets, eda, analytics, investigate,
│   │                                        # ask, new_transaction, dgraph_fin_score,
│   │                                        # ethereum_fraud, temporal_validation
│   └── services/                            # fraud_predictor, new_transaction_predictor_service,
│                                              # dgraph_fin_predictor_service,
│                                              # ethereum_fraud_predictor_service,
│                                              # temporal_predictor_service, precompute_summaries
├── frontend/                                  # React app (Vite)
│   └── src/pages/                               # Dashboard, Investigate, ScoreNewTransaction,
│                                                  # ScoreUnlabeledAccount, EthereumFraud,
│                                                  # TemporalValidation, Analytics, EDA, AskYourData
├── ml/                                            # graph construction, training, inference, validation
│   ├── build_ieee_cis_graph_data.py / build_dgraph_fin_graph_data.py
│   ├── train_*_baseline.py / train_*_gnn.py       # LightGBM / GraphSAGE training
│   ├── train_ethereum_fraud.py                     # third experiment, standalone
│   ├── train_temporal_comparison.py                 # LightGBM: random vs. chronological split
│   ├── train_temporal_gnn_comparison.py               # GraphSAGE: random vs. chronological split
│   ├── train_and_save_temporal_model.py                # saves the real, servable temporal model
│   ├── build_rolling_features.py                         # real, leak-free rolling-window features
│   ├── stack_*.py                                  # logistic stacking
│   ├── multiseed_*.py                               # 3-seed statistical validation
│   ├── inference.py / dgraph_fin_inference.py       # real-time prediction for existing records
│   ├── new_transaction_*.py                          # genuinely new/unseen transaction scoring
│   ├── validate_*.py                                  # ground-truth validation scripts (see note below)
│   └── checkpoints/                                    # trained model files (gitignored — see
│                                                          # Model Weights below)
└── (no separate tests/ folder — see note below)
```

**On `tests/`:** this project's real correctness checking was done through
**validation scripts** (`ml/validate_new_transaction_pipeline.py`,
`ml/multiseed_*.py`, etc.) that check the pipeline and predictions against
real, known ground truth — not pytest-style unit tests. These caught and
fixed several real bugs during development (a `log1p` scaling mismatch, a
categorical-encoding inconsistency, a degree-feature bug in the
new-transaction pipeline). This is real, substantive validation rigor —
just a different kind than a conventional `tests/` folder implies.

---

## Model weights

Trained model checkpoints (`ml/checkpoints/*.pt`, `*.txt`, `*.pkl`) are
**not** committed to this repo — they're large binaries better suited to a
model registry. Real, published weights (IEEE-CIS and DGraph-Fin):
**https://huggingface.co/karthifde/apexfi-fraud-detection**

---

## Setup with uv

```bash
# install uv if you don't have it
curl -LsSf https://astral.sh/uv/install.sh | sh

uv sync
```

Copy `.env.example` to `.env` and fill in your database connection details
and any LLM provider API keys you want enabled (`GROQ_API_KEY`,
`MISTRAL_API_KEY`, `OPENROUTER_API_KEY`, `CEREBRAS_API_KEY`) before running
anything that touches the database or Ask Your Data.

### Run the web app

```bash
# backend
uv run uvicorn backend.main:app --reload

# frontend (separate terminal)
cd frontend
npm install
npm run dev
```

### Run the Streamlit deep-EDA app

```bash
cd streamlit_app
uv run streamlit run Home.py
```

---

## Real, validated results

### IEEE-CIS (3-seed statistical validation)

| Model | Precision | Recall | F1 | ROC-AUC |
|---|---|---|---|---|
| LightGBM alone | 0.825 ± 0.005 | 0.768 ± 0.001 | 0.796 ± 0.002 | 0.973 ± 0.000 |
| GraphSAGE alone | 0.466 | 0.522 | 0.492 | 0.892 |
| **Stacked (winner)** | **0.878 ± 0.002** | 0.731 ± 0.001 | **0.798 ± 0.001** | **0.974 ± 0.000** |

Learned stacking weight: ~19:1 favoring LightGBM — tabular features
dominate here, with the graph contributing a real but small correction.

### DGraph-Fin (3-seed statistical validation)

| Model | Precision | Recall | F1 | ROC-AUC |
|---|---|---|---|---|
| LightGBM alone | 0.992 ± 0.009 | 0.524 ± 0.000 | 0.686 ± 0.002 | 0.938 ± 0.000 |
| GraphSAGE alone | 1.000 | 0.524 | 0.688 | 0.916 |
| **Stacked (winner)** | **0.995 ± 0.005** | 0.524 ± 0.000 | **0.687 ± 0.001** | **0.938 ± 0.001** |

Learned stacking weight: nearly balanced — the graph and tabular signals
are genuinely complementary here, unlike IEEE-CIS. This dataset-dependent
contrast is one of the project's more interesting findings: **graph
information is not universally superior — its value depends on the
underlying structure of the data.**

**Two honest comparison caveats, stated plainly:**
- IEEE-CIS's ROC-AUC (0.9736) is higher than the top Kaggle competition
  solution's best individual model (0.9408 private leaderboard) — but our
  split is random/stratified, while Kaggle's private test set may have
  used a temporal split (a harder, more realistic evaluation). Not a
  fully apples-to-apples comparison. **This is directly, empirically
  investigated in the Temporal Validation section above.**
- DGraph-Fin's numbers are **not** directly comparable to published
  academic benchmarks (e.g., GADBench's ~66.9% AUC for current
  specialized methods) — those papers deliberately test a much harder,
  low-label scenario (as few as 100 labeled examples total). This project
  trains under full supervision (857,920 real labeled examples), which is
  a different, not-comparable task.

**A real, empirically observed generalization gap worth stating too:** a
simplified reproduction of the IEEE-CIS model (see the Kaggle notebook
above) scored ROC-AUC 0.93 on an internal random-split test, but only
0.733 on the actual official competition test set — concrete, measured
evidence for the random-vs-temporal-split caveat above, not just an
assumed risk. **See the Temporal Validation section for two further,
independent confirmations of this same real pattern.**

---