# Free deployment (no Docker on your PC, no payment)

| Part | Where | Cost |
|---|---|---|
| React app | Vercel | free |
| Streamlit app | Streamlit Community Cloud | free |
| FastAPI backend | Hugging Face **Space** (Docker, 16 GB RAM) | free |
| Models (2.1 GB) | Hugging Face **model repo** (private) | free |
| Gold data (full) | Hugging Face **dataset repo** (private), as Parquet | free |

Your local Postgres, your `data/` folder and your pipeline are **not changed**. The live app reads a Parquet copy
of the Gold layer with DuckDB. Locally nothing changes (`DATA_BACKEND` defaults to `postgres`).

## How it works
1. `scripts/export_gold_parquet.py` copies each `gold.*` table to a Parquet file (Postgres is opened READ ONLY).
2. `deploy/upload_to_hf.py` uploads the Parquet files and the model files to two **private** Hugging Face repos.
3. `deploy/push_space.py` creates a public Space with the backend **code only** and stores the keys as Space secrets.
4. When the Space starts, `deploy/fetch_assets.py` downloads the models and Parquet files, then FastAPI starts.
5. DuckDB turns every Parquet file into a view `gold.<table>`, so all existing SQL works unchanged.

## Safety notes
- "Ask your data" runs on a DuckDB engine that can only read the Parquet folder: file access is switched off,
  extension loading is off and the settings are locked. The SQL validator also blocks file/system functions.
- A global daily cap (`ASK_DAILY_CAP`, default 500) protects the free LLM quotas. Per-IP rate limits still apply.
- Keep the data and model repos **private** (IEEE-CIS and DGraph-Fin have their own licences).
- Never paste tokens into chat, code or git. Use the `read -s` commands below.

## Limits of the free tier (be honest about these in the demo)
- A free Space sleeps after a period without visits. The first request after sleeping takes a few minutes
  (it downloads the files again). Open the API URL a few minutes before a demo.
- One server process: the in-memory rate limiter is enough (no Redis needed).
- Check the current Hugging Face free-tier limits before relying on them.
