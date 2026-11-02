# ApexFi V2 evaluation (summary)

Full detail: `ApexFi_V2_Evaluation_Report.pdf` in this folder, and the **V2 Evaluation** page in the app (More menu).

- Data: combined Golden layer, 4,291,090 labelled records (IEEE-CIS 590,540 + DGraph-Fin 3,700,550).
- Test: time-ordered split. Last 25% of IEEE-CIS (147,635 transactions, 5,100 frauds) is the untouched test block.
- Result: tuned LightGBM, 449 features, PR-AUC 0.524, ROC-AUC 0.907. V1 (7 features): PR-AUC 0.181, ROC-AUC 0.790.
- Benchmark: 25 classifiers + Dummy baseline. Top models are boosting and ensembles, within 3.4% of each other.
- DGraph-Fin correction: the old ROC-AUC 0.938 came from the leaking `node_timestamp` column. Corrected: ROC-AUC 0.71 to 0.78, PR-AUC 0.03 to 0.04.
- Limits: proxy datasets (US card data, DGraph-Fin), 100,000-row benchmark sample, mostly single seed, M4 column empty (ETL defect), dollar results depend on assumed costs.
