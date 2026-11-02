"""One-time fix: remove the leaking node_timestamp column from an EXISTING dgraph_fin_graph.pt.

node_timestamp is filled only for fraud accounts (fillna(0) elsewhere), so a non-zero value means fraud. The V2 audit showed it
lifts ROC-AUC from about 0.73 to 0.93. This script checks that the last column really is that column, backs up the old graph, and
saves a graph with 18 features (x1..x17 + total_degree). Run:  uv run python -m ml.drop_timestamp_from_graph
(Or rebuild with the patched ml/build_dgraph_fin_graph_data.py, which already leaves the column out.)"""
import os, shutil, sys
import torch

PATH = "dgraph_fin_graph.pt"
BACKUP = "dgraph_fin_graph_WITH_TIMESTAMP_backup.pt"

def main():
    if not os.path.exists(PATH):
        sys.exit(f"{PATH} not found. Run from the repo root.")
    data = torch.load(PATH, weights_only=False)
    n = data.x.shape[1]
    if n == 18:
        print("Already 18 features (no timestamp). Nothing to do."); return
    if n != 19:
        sys.exit(f"Expected 19 columns (17 x + degree + timestamp), found {n}. Not changing anything.")
    ts = data.x[:, -1]
    lab = data.y
    fraud, normal = lab == 1, lab == 0
    print(f"Last column: non-zero for {(ts[fraud] != 0).float().mean():.1%} of fraud nodes and {(ts[normal] != 0).float().mean():.1%} of normal nodes.")
    if (ts[normal] != 0).any():
        sys.exit("Last column is non-zero for some normal nodes, so it does not look like node_timestamp. Not changing anything.")
    if not os.path.exists(BACKUP):
        shutil.copy(PATH, BACKUP); print(f"Backed up to {BACKUP}")
    data.x = data.x[:, :-1].contiguous()
    torch.save(data, PATH)
    print(f"Saved {PATH} with {data.x.shape[1]} features.")

if __name__ == "__main__":
    main()
