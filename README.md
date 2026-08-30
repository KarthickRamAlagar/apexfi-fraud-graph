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
│   ├── pages/                       # Full Profiling, Raw Data Browser, Model Evaluation
│   └── data/                          # precomputed snapshots (parquet/json), regenerate via
│                                        # backend.services.export_snapshot when missing
├── backend/                             # FastAPI app
│   ├── routers/                           # dashboard, datasets, eda, analytics, investigate,
│   │                                        # ask, new_transaction, dgraph_fin_score
│   └── services/                            # fraud_predictor, new_transaction_predictor_service,
│                                              # dgraph_fin_predictor_service, precompute_summaries
├── frontend/                                  # React app (Vite)
│   └── src/pages/                               # Dashboard, Investigate, ScoreNewTransaction,
│                                                  # ScoreUnlabeledAccount, Analytics, EDA, AskYourData
├── ml/                                            # graph construction, training, inference, validation
│   ├── build_ieee_cis_graph_data.py / build_dgraph_fin_graph_data.py
│   ├── train_*_baseline.py / train_*_gnn.py       # LightGBM / GraphSAGE training
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
model registry. Find them on Hugging Face Hub: *(link to be added once
published)*.

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
streamlit run Home.py
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
  fully apples-to-apples comparison.
- DGraph-Fin's numbers are **not** directly comparable to published
  academic benchmarks (e.g., GADBench's ~66.9% AUC for current
  specialized methods) — those papers deliberately test a much harder,
  low-label scenario (as few as 100 labeled examples total). This project
  trains under full supervision (857,920 real labeled examples), which is
  a different, not-comparable task.

---

## License

*(add your chosen license here)*