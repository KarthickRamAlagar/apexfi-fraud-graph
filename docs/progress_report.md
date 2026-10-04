# UPI/IMPS Cross-Channel Fraud Detection & Explainable AI
### M.Tech Final Project — Progress Report

**Status as of this report:** Stage 1 (ETL — Bronze, Silver, Gold) fully complete, including real-graph construction for both datasets. Stage 5 (model training) environment set up and in progress — **paused mid-run** to prioritize other commitments; resuming from a saved checkpoint.

## Current Status Summary (for review)

| Stage | Status |
|---|---|
| 1. ETL — Bronze | ✅ Complete — 7 tables, ~8.7M rows, all real data |
| 1. ETL — Silver | ✅ Complete — cleaned, typed, two documented data-quality investigations resolved |
| 1. ETL — Gold | ✅ Complete — feature-ready tables for both IEEE-CIS and DGraph-Fin |
| Graph construction (IEEE-CIS) | ✅ Complete — 17.3M evidence-based edges built (`device_shared`, `card_shared`) |
| Graph construction (DGraph-Fin) | ✅ Complete — native graph, with degree features added |
| ML environment setup | ✅ Complete — PyTorch (CPU) + PyTorch Geometric verified working |
| Graph tensor construction (IEEE-CIS) | ⏸ In progress, paused — script written and running; not yet completed a full pass |
| Model training | Not yet started |
| EDA (React + Streamlit) | Not yet started |
| Web application (FastAPI + React) | Not yet started |

**What this represents:** the entire data engineering foundation of the project — sourcing, cleaning, and preparing ~8.7 million rows of real financial fraud data across two independent real-world datasets, plus the evidence-based construction of graph structure for both — is complete and verified. This is the substantial, defensible groundwork the rest of the project (model training, explainability, and the application layer) builds on.



---

## 1. Project Overview

**Title:** Real-Time Cross-Channel Fraud Detection & Explainable AI for Indian Digital Payment Systems (UPI/IMPS), using Heterogeneous Graph Neural Networks.

**Problem statement mapping:** This project satisfies the department's listed problem statement *"Explainable AI for Blockchain/Fraud Detection"* — most fraud-detection systems use black-box ML models with limited explainability, undermining trust and regulatory acceptance. This project builds a transparent, auditable, graph-based fraud detection framework for Indian digital payments, going beyond the baseline "black-box ML" framing with a modern graph-neural-network approach and built-in structural explainability.

**Note:** This project replaces an earlier scoped project on Explainable AI for Ethereum blockchain fraud detection. The pivot moved the domain from blockchain transactions to Indian UPI/IMPS digital payments, while keeping the same core commitment to explainable, auditable fraud detection.

---

## 2. Core Approach

Traditional fraud detection treats each transaction as an independent row. This project instead represents the payment ecosystem as a **Dynamic Heterogeneous Information Network (HIN)** — users, merchants, and accounts as connected nodes — so that fraud patterns spread across multiple linked accounts (which look innocuous individually) become visible structurally.

**Key techniques:**
- **GraphSAGE** (Hamilton et al., NeurIPS) — neighborhood aggregation for inductive graph representation learning
- **Structural Focal Loss** (Lin et al., ICCV) — down-weights easy/majority examples, focuses training on rare fraud cases, addressing the extreme class imbalance confirmed in our data (see Section 4)
- **GNNExplainer** (Ying et al., NeurIPS) — produces a localized explanation subgraph for any flagged transaction, showing which connected accounts/edges drove the prediction — this is the core explainability contribution

---

## 3. Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Database | PostgreSQL (local, native Windows install) | No Docker dependency; simpler local dev setup |
| Data layers | Medallion: Bronze → Silver → Gold | Bronze = raw/untouched, Silver = cleaned/typed, Gold = feature-store, business-ready |
| Package manager | `uv` | Fast, reproducible dependency management; handles PyTorch Geometric's fiddly install better than pip |
| Backend | FastAPI (Python) | Serves the model, GNNExplainer output, and Gold-layer data to the frontend |
| Frontend | React | Talks directly to FastAPI — no Node.js layer in between |
| Deep EDA | Standalone Streamlit app | Embedded in the React app's EDA page, styled after reference apps like the Pima Indians Diabetes EDA/classification Streamlit app |
| Blockchain / Digital Twin | **Excluded** | Considered from the department's problem-statement list, but doesn't fit the fraud-detection domain — would have diluted focus rather than adding value |

**React frontend pages (final):**
1. **Dashboard** — overview: total transactions, risk alerts, fraud detection rate
2. **Datasets** — what's loaded, row/column stats
3. **Transactions / Investigate** — per-transaction GNNExplainer subgraph view
4. **Analytics** — trend charts (fraud rate over time, volume vs. RBI indicators)
5. **EDA** — embedded Streamlit app
6. **EDA Report** — static, shareable summary of key EDA findings
7. **Ask your data** — text-to-SQL chat page: natural-language question → LLM generates SQL → runs read-only against the Gold layer → returns results (with a Postgres read-only role as a safety rail)

**Build order:** ETL → EDA (React page + Streamlit) → Web application shell → Streamlit deep EDA → Train/test the GNN model → Output/results page in the web app.

---

## 4. Data Sources

### 4.1 Proxy transaction/graph datasets (static, real, public)

**IEEE-CIS Fraud Detection Dataset** (Kaggle) — high-dimensional real transaction data with device, card, and behavioral features.
- `train_transaction.csv`: 590,540 rows, 394 columns
- `train_identity.csv`: 144,233 rows, 41 columns (device/browser fingerprint data, joins on `TransactionID`)
- **Real fraud rate: 3.499%** (20,663 fraud cases out of 590,540) — the empirical justification for using Focal Loss rather than standard cross-entropy

**DGraph-Fin** (dgraph.xinye.com, Finvolution Group, NeurIPS'22 dataset paper) — real financial social-network graph. A node is a Finvolution user; an edge means "this user listed that user as an emergency contact." Non-commercial academic license.
- 3,700,550 nodes, 17-dimensional features (`x`), label (`y`)
- 4,300,999 edges, 11 edge types, encrypted edge timestamps
- **Real label distribution:** Class 0 (normal) = 1,210,092; **Class 1 (fraud) = 15,509** (~1.27% of labeled nodes — extreme imbalance); Classes 2/3 (background, non-target) = 2,474,949 combined
- Extended with **DGraph-Fin2**'s per-node timestamp array (tracks when a labeled node's status changed; sentinel `int32` min for background nodes with no such event) and its own edge-timestamp array (kept separately from the original for comparison during Silver processing)

### 4.2 Real RBI/NPCI context data (data.gov.in, India's official Open Government Data platform)

- **Money Rates in India, 2000-01 to 2017-18** — RBI Bank Rate, SBI/major-bank lending rates, call money rate. 18 rows (one per fiscal year), 5 columns.
- **Digital Payment Transactions (quarterly, 2022)** — real NPCI-sourced data via a Rajya Sabha parliamentary answer. 4 rows (quarterly), 3 columns.
- **Digital Payment Volume (monthly)** — monthly digital payment volume/value data. 13 rows (12 months + total), 3 columns.

**Access method note:** data.gov.in provides live APIs for only a subset of its datasets (~203 of 12,516 catalogs at time of writing). Where an API exists (confirmed via each dataset's "API" tab), data was fetched programmatically; where it doesn't, CSVs were downloaded manually from the portal. This hybrid access pattern is documented in code (`etl/extract/fetch_rbi_dbie.py` for the API path, `etl/load/load_rbi_npci_bronze.py` for the CSV path).

One dataset (bank-fraud-amounts-by-year, resource `0c87a3e6-331e-4894-9d8c-8bf0039ba5da`) was deliberately dropped after its API proved consistently unresponsive — assessed as non-essential since it would have duplicated the kind of small, static, yearly context already covered by the Money Rates table.

---

## 5. Stage 1 (ETL) Results — Bronze Layer Complete

All raw data loaded into PostgreSQL, verified via independent row-count checks (both Python/SQLAlchemy and direct `psql` queries):

| Table | Rows | Columns | Source |
|---|---:|---:|---|
| `bronze.raw_ieee_cis_transaction` | 590,540 | 394 | IEEE-CIS (Kaggle) |
| `bronze.raw_ieee_cis_identity` | 144,233 | 41 | IEEE-CIS (Kaggle) |
| `bronze.raw_dgraph_fin_nodes` | 3,700,550 | 21 | DGraph-Fin (+ Fin2 node timestamps) |
| `bronze.raw_dgraph_fin_edges` | 4,300,999 | 6 | DGraph-Fin (+ Fin2 edge timestamps) |
| `bronze.raw_money_rates_2000_2018` | 18 | 5 | data.gov.in (RBI) |
| `bronze.raw_digital_payment_transactions` | 4 | 3 | data.gov.in (NPCI, quarterly) |
| `bronze.raw_digital_payment_volume_monthly` | 13 | 3 | data.gov.in (NPCI, monthly) |

**Total: ~8,741,000 rows across 7 tables.**

**Loading approach:** All large tables loaded via PostgreSQL's native `COPY` mechanism (a custom `psql_insert_copy` pandas helper, `etl/load/bulk_utils.py`) rather than row-by-row `INSERT`s — necessary at this scale (IEEE-CIS's 394-column width alone would exceed PostgreSQL's per-statement parameter limit under a naive multi-row insert approach).

Bronze is intentionally raw/untouched at this stage — no cleaning, type coercion, or deduplication applied yet. That was the scope of the Bronze → Silver step, completed below.

---

## 6. Stage 1 (ETL) Results — Silver Layer Complete

Bronze tables cleaned, typed, and standardized into Silver:

| Table | Rows | Key transforms |
|---|---:|---|
| `silver.ieee_cis_transactions` | 590,540 | Left-joined transaction + identity on `TransactionID`; `isfraud`/`M1`-`M9` cast to proper booleans; added a real `transaction_date` derived from `TransactionDT` (anchored to 2017-12-01, the community-standard reference point for this competition — relative ordering/day-of-week/time-of-day patterns are reliable, the exact calendar date is an assumption, not a verified fact) |
| `silver.dgraph_fin_nodes` | 3,700,550 | Converted the Fin2 node-timestamp sentinel (`int32` min) to proper `NULL`; added a readable `label` column (normal/fraud/background) alongside the original numeric label. **Finding:** only 15,509 nodes have a non-null timestamp — exactly the fraud count — meaning Fin2's node timestamps record fraud-onset events specifically, not general status changes |
| `silver.dgraph_fin_edges` | 4,300,999 | Kept both edge-timestamp fields and verified their relationship rather than assuming. **Finding:** `edge_timestamp_v2 = max(edge_timestamp - 31, 0)` holds for 100% of all 4,300,999 edges — Fin2's edge timestamp is a rebased, clipped copy of the original, not independent data. The original `edge_timestamp` is retained as canonical going forward |
| `silver.rbi_money_rates` | 18 | Split the combined "min-max" lending-rate range into separate numeric columns |
| `silver.npci_digital_payments_quarterly` | 4 | Light cleanup |
| `silver.npci_digital_payments_monthly` | 12 | Dropped the "Total" summary row present in the source (a derived aggregate, not a real observation — left in, it would silently corrupt any future `SUM`/`AVG`) |

All Silver transforms run natively inside PostgreSQL (`CREATE TABLE AS SELECT`), avoiding pulling multi-million-row tables into Python memory.

---

## 7. Stage 1 (ETL) Results — Gold Layer Complete

Gold is built as several purpose-built tables (not one flat master table — IEEE-CIS's transaction rows, DGraph-Fin's graph structure, and RBI/NPCI's low-frequency context are structurally different and were never meant to merge into a single table). Each table is additive over Silver — real derived features layered on top, nothing removed.

| Table | Rows | Derived features added |
|---|---:|---|
| `gold.ieee_cis_features` | 590,540 | `day_of_week`, `hour_of_day`, `is_weekend` (from `transaction_date`); `fiscal_year` (India's Apr-Mar convention); RBI context (`bank_rate`, `sbi_lending_rate`, `call_money_rate`) joined by fiscal year |
| `gold.dgraph_fin_nodes` | 3,700,550 | `in_degree`, `out_degree`, `total_degree`, computed from the real edge list |
| `gold.dgraph_fin_edges` | 4,300,999 | Canonical `edge_timestamp` only (the redundant `edge_timestamp_v2` dropped after its diagnostic purpose was served in Silver) |
| `gold.rbi_money_rates` | 18 | `fiscal_year_start` (numeric, for easier filtering/sorting) |
| `gold.npci_digital_payments_quarterly` | 4 | — |
| `gold.npci_digital_payments_monthly` | 12 | — |

**Data-quality findings documented during Gold construction:**

- **RBI context coverage gap:** the RBI Money Rates dataset covers fiscal years 2000-01 through 2017-18. IEEE-CIS transactions span Dec 2017 - June 2018, which straddles two fiscal years — FY2017-18 (414,542 transactions, 100% matched to RBI context) and FY2018-19 (175,998 transactions, 0% matched, since the source RBI dataset simply doesn't extend that far). These rows are left as `NULL` for the RBI columns rather than estimated/forward-filled, to avoid presenting a guess as real data. This is judged to have negligible impact on model quality, since RBI rate context is a weak supplementary signal — all 394 of IEEE-CIS's core transaction/behavioral features remain 100% complete.
- **NPCI temporal mismatch:** the NPCI digital-payment datasets (2022) are not joined onto IEEE-CIS (Dec 2017 - June 2018) — doing so would misleadingly imply same-era context for data that's actually ~4 years apart. They're retained as standalone Gold tables instead, for use in the Analytics dashboard on their own terms.
- **DGraph-Fin degree-by-label finding:** average `total_degree` is 2.89 for normal users vs. 1.95 for fraud users vs. 2.05 for background — fraud users are measurably less connected in this "emergency contact" graph than normal users. This is an early, real signal (independent of any model) that the graph's structure carries fraud-relevant information, supporting the core premise of the graph-based approach.
- **Class imbalance is deliberately not addressed via synthetic balancing (e.g. SMOTE)** at this stage. For a graph-structured dataset, synthetically generating fraud examples would fabricate nodes with no real edges/neighbors, corrupting the structure the GNN depends on. Imbalance is instead handled at training time via Structural Focal Loss (see Section 2), which reweights the loss function rather than fabricating data.

---

## 9. IEEE-CIS Transaction Graph Construction

A key architectural clarification made at this point: IEEE-CIS and DGraph-Fin cannot be merged into one unified graph, since they represent entirely different real-world populations with no shared entities (a DGraph-Fin node and an IEEE-CIS card number are not the same person). The project therefore uses **two separate graphs under one shared GNN methodology** (HeteroConv + GraphSAGE + Structural Focal Loss + GNNExplainer) — DGraph-Fin's native graph, and a graph built from IEEE-CIS's own transaction data.

**Evidence-based edge selection:** rather than guessing which fields to connect transactions on, an EDA pass (`eda_shared_attribute_analysis.py`) tested 11 candidate identity-linking fields (`card1`-`card6`, `addr1`-`addr2`, both email domains, `DeviceType`, `DeviceInfo`) for: unique value count, how frequently values are shared, and — critically — a "fraud lift" metric (fraud rate among transactions sharing a value vs. transactions that don't share it with anyone).

**Findings:**
- `deviceinfo`: lift **2.67** (7.27% fraud rate when shared vs. 2.73% for singleton devices), based on a reliable 440-transaction singleton comparison — the strongest real signal found. Fraudsters measurably reuse devices across transactions.
- `card1`: lift **0.82** on its own (weak/slightly negative), based on a reliable 3,444-transaction singleton comparison.
- `card2`, `card3`, `card5`, `card6`, `addr1`, `addr2`, both email domains, `devicetype`: excluded as edge candidates — either too coarse (as few as 2-4 distinct values across 590K transactions, which would merge huge unrelated portions of the dataset into meaningless clusters) or too few singleton transactions to trust a lift calculation (fewer than ~20 in several cases).

**Edges built** (`gold.ieee_cis_transaction_edges`, 17,322,878 total, purely additive — `gold.ieee_cis_features` unchanged at 590,540 rows/all original columns/target variable):
- `device_shared`: 1,407,155 edges (the primary, evidence-backed edge type)
- `card_shared`: 15,915,723 edges (included for structural/methodological reasons standard in fraud-graph literature, despite weak standalone lift — a GNN can extract multi-hop patterns from card-linked neighborhoods that a simple lift calculation can't capture)

A group-size cap of 500 transactions per shared value was applied to prevent a small number of very common values from creating enormous, non-discriminative "hub" clusters. `card_shared` edges substantially outnumber `device_shared` edges due to this cap still allowing large card groups; this density will be monitored during model training (Stage 5) for computational cost and potential over-smoothing, with the cap available to tighten if needed at that stage.



Stage 1 (ETL — Bronze, Silver, and Gold) is now fully complete for all data sources. Remaining stages:

1. **EDA** — React EDA page + standalone Streamlit deep-EDA app, built on top of the Gold tables
2. Web application shell (FastAPI + React)
3. GNN model training (HeteroConv + GraphSAGE, Structural Focal Loss)
4. GNNExplainer integration and results/output page

---

*This report reflects project state as of the completion of Stage 1 (ETL) in full — Bronze, Silver, and Gold. Update after each major stage.*

