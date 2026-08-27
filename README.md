# UPI/IMPS Cross-Channel Fraud Detection & Explainable AI

M.Tech project — heterogeneous Graph Neural Network fraud detection for Indian
digital payments, with GNNExplainer-based explainability, a React + FastAPI
web app, and a Streamlit deep-EDA app.

## Build order (do not skip ahead)
1. **ETL** — `etl/` — fetch IEEE-CIS, DGraph-Fin, RBI DBIE, NPCI data into
   Postgres Bronze -> Silver -> Gold
2. **EDA** — `eda/` (notebooks) + `streamlit_app/` — explore the Gold layer
3. **Web application** — `backend/` (FastAPI) + `frontend/` (React) shell
4. **Streamlit deep EDA** — richer standalone exploration app
5. **ML** — `ml/` — build the graph, train the GNN, run GNNExplainer
6. **Output page** — results/risk-score view wired into the web app

## Folder layout
```
upi-fraud-gnn/
├── data/                # local data lake (gitignored except .gitkeep)
│   ├── raw_downloads/   # untouched downloaded files
│   ├── bronze/          # raw, loaded as-is into Postgres-mirrored files
│   ├── silver/          # cleaned/standardized
│   └── gold/            # feature-store, business-ready
├── etl/
│   ├── extract/         # one fetch script per data source
│   ├── load/            # loads extracted data into Bronze
│   ├── transform/       # Bronze->Silver, Silver->Gold
│   └── db/              # connection.py, schema.sql
├── eda/notebooks/        # exploratory notebooks (throwaway analysis)
├── streamlit_app/         # standalone deep-EDA Streamlit app
├── backend/                # FastAPI app (serves Gold data, model, text-to-SQL)
├── frontend/               # React app (scaffold with `npm create vite@latest .`)
├── ml/                      # graph construction, GNN model, training, GNNExplainer
└── tests/
```

## Setup with uv
```bash
# install uv if you don't have it
curl -LsSf https://astral.sh/uv/install.sh | sh

# sync just what you need for the current stage, e.g. ETL first:
uv sync --group etl

# later stages, add groups as you reach them:
uv sync --group etl --group eda
uv sync --group etl --group eda --group backend
uv sync --group etl --group eda --group backend --group ml --group llm

# run something
uv run python etl/extract/fetch_ieee_cis.py
uv run streamlit run streamlit_app/Home.py
uv run uvicorn backend.main:app --reload
```

## Note on torch-geometric
`torch-geometric` core installs fine from PyPI, but its optional compiled
extensions (torch-scatter, torch-sparse) need wheels matched to your exact
torch + CUDA/CPU build. We are not adding those as hard dependencies yet —
revisit this when we reach Stage 5 (ML), once we know the target machine.

## Database
Postgres running locally (see `docker-compose.yml`). Copy `.env.example` to
`.env` and fill in connection details before running any ETL script.
