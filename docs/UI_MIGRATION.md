# ApexFi: new layout, Ops, PDF reports, no Streamlit

All ApexFi content and findings are unchanged. Only the frame around them changed.

## What changed
- Layout: left sidebar with groups (Overview, Data, Detect, Evaluation, Impact, System) replaces the top bar. Dark and light theme. Search box, live API chip.
- Colours and fonts: the DEM (AETHER GIS) palette, Space Grotesk and IBM Plex Mono. The old pages are re-coloured through the shared theme variables, so their code is untouched.
- New pages: Ops, Settings, Full Profiling, Raw Data Browser, Model Evaluation. The last three replace the Streamlit pages and read the same saved files through the API.
- Download PDF buttons: V2 Evaluation, Score New Transaction, Score Unlabeled Account, Ops. DEM report template, ApexFi name, only real data. Settings controls decimals and which blocks print.
- Streamlit: removed. The saved results folder `streamlit_app/data` is now `app_data`.

## New API routes (backend)
- `/api/deep/overview`, `/api/deep/profiling/{table}`, `/api/deep/column/{table}/{column}`, `/api/deep/raw/{table}`, `/api/deep/raw/{table}.csv`, `/api/deep/model-evaluation`
- `/api/ops/health`, `/api/ops/summary` (response times are measured since the server started)

## Checks done before sending
- `vite build` passes. New pages screenshot-tested in dark and light against the real saved files.
- PDFs generated in a browser and viewed.
- Existing pages (Dashboard, Investigate, scoring) need your real backend and database. They were NOT run here.

## Not changed on purpose
- Findings, numbers, model code, pipeline, Silver and Gold, M4 side file.
- `uv.lock` still lists streamlit until you run `uv lock`.
