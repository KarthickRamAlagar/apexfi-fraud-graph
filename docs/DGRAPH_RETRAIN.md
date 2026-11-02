# DGraph-Fin retrain without `node_timestamp`

**Why.** `node_timestamp` is filled only for fraud accounts (all 15,509 fraud nodes have it; all 1,210,092 normal nodes are empty), and the old
graph builder filled the empty ones with 0. A non-zero value therefore meant "fraud". The old ROC-AUC of 0.938 came from that column. V2 ablation:
ROC-AUC 0.93 with it, 0.73 without. The old models and every number computed from them are invalid.

**What changed.** The graph now has 18 features: x0..x16 and total_degree. The Gold table still holds `node_timestamp` for reference.

**Retrained models** (random 70/15/15 split of 1,225,601 labelled accounts, seed 42; 857,920 train / 183,840 validation / 183,841 test; fraud rate 1.27%).
Trained in the V2 sandbox (CPU) with this repo's own scripts, with the small patches in `patch_dgraph_ml.py`:

| Model | Test ROC-AUC | Test PR-AUC |
|---|---|---|
| LightGBM (mean of 3 seeds) | 0.7608 | 0.0331 |
| GraphSAGE (one run, 4 epochs) | 0.7740 | 0.0372 |
| Stacked LightGBM + GraphSAGE (3 seeds, one GNN checkpoint) | 0.7780 | 0.0379 |
| Old leaky stack (invalid) | 0.938 | 0.585 |

At the default threshold 0.5 the corrected stack flags no accounts. The app now uses a validation-chosen threshold (0.029, F1-optimal):
test precision 0.043, recall 0.322, F1 0.075, 9.6% of accounts flagged, lift 4.6 in the top 1% and 3.8 in the top 5%.
This is a hard dataset (published methods also reach PR-AUC of only a few percent). Use the score to rank accounts for review, not to decide automatically.

**Caveats.**
- The split here is my own seed-42 split of the Gold Parquet rows, not the exact split of your old `dgraph_fin_graph.pt` (row order may differ). The saved
  checkpoints do not depend on row order, so they work on your graph for scoring. Do not re-run the evaluation scripts on your graph with these checkpoints:
  some of your test accounts were in my training set. To get a fully self-consistent set on your own machine, run the six commands below instead.
- Early stopping in `train_gnn` picks the epoch by validation F1 at threshold 0.5, which is a poor criterion when almost nothing is flagged. Kept as is.
- The LightGBM was re-fitted with 3 seeds; the GraphSAGE checkpoint was reused across seeds (as in the original script).
- Checkpoints were pickled with scikit-learn from the sandbox; a different scikit-learn version may print a warning when loading the stacking file.

**Re-run on your own machine** (about 10 to 20 minutes on CPU):

    python -m ml.drop_timestamp_from_graph          # or rebuild with the patched build_dgraph_fin_graph_data.py
    python -m ml.train_dgraph_fin_baseline
    python -m ml.train_dgraph_fin_gnn
    python -m ml.stack_dgraph_fin
    python -m ml.multiseed_dgraph_fin
    python -m ml.dgraph_fin_threshold
