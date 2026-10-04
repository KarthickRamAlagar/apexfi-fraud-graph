#!/usr/bin/env bash
# Run from the ROOT of your real repo (Git Bash). Uses git mv so history is kept.
set -e
mkdir -p etl/profiling etl/validation etl/maintenance docs/reports eda ml/diagnostics
git mv inspect_ieee_cis.py inspect_dgraphfin_full.py bronze_summary.py etl/profiling/
git mv verify_bronze.py verify_fy_match.py verify_timestamp_formula.py compare_money_rates.py compare_edge_timestamps.py etl/validation/
git mv rename_table.py etl/maintenance/
git mv eda_shared_attribute_analysis.py eda/
git mv bronze_summary.txt docs/reports/ 2>/dev/null || mv bronze_summary.txt docs/reports/ || true
git mv leakage_and_reproducibility_audit.md docs/
git mv "Upi fraud gnn progress report.md" docs/progress_report.md
git mv ml/debug_*.py ml/check_*.py ml/find_recent_card.py ml/get_real_transaction_fields.py ml/diagnostics/
touch etl/profiling/__init__.py etl/validation/__init__.py etl/maintenance/__init__.py eda/__init__.py ml/diagnostics/__init__.py
git rm -q --cached frontend/public/images/ashoka-lion-capital.png streamlit_app/assets/ashoka-lion-capital.png 2>/dev/null || true
rm -f frontend/public/images/ashoka-lion-capital.png streamlit_app/assets/ashoka-lion-capital.png
echo "Done. Now copy the edited files from the updated zip over your repo (see change list)."
