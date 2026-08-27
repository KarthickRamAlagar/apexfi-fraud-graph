-- Medallion layout: separate Postgres schemas per layer.
-- Fill in actual tables once the source datasets are inspected (Stage 1: ETL).

CREATE SCHEMA IF NOT EXISTS bronze;
CREATE SCHEMA IF NOT EXISTS silver;
CREATE SCHEMA IF NOT EXISTS gold;

-- bronze.raw_ieee_cis            (untouched IEEE-CIS load)
-- bronze.raw_dgraph_fin          (untouched DGraph-Fin load)
-- bronze.raw_rbi_indicators      (untouched RBI DBIE / data.gov.in pulls)
-- bronze.raw_npci_metrics        (untouched NPCI aggregate stats)

-- silver.stg_transactions
-- silver.stg_accounts
-- silver.stg_context_indicators

-- gold.dim_accounts
-- gold.dim_merchants
-- gold.fact_transactions
-- gold.feature_store
-- gold.fraud_labels
