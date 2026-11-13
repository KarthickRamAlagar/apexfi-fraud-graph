from pathlib import Path

import numpy as np

DIR = Path("data/raw_downloads/dgraph_fin")

print("=== dgraphfin.npz ===")
data = np.load(DIR / "dgraphfin.npz")
print("Keys:", list(data.keys()))
for key in data.keys():
    arr = data[key]
    print(f"  {key}: shape={arr.shape}, dtype={arr.dtype}")

print("\n=== dgraphfinv2_node_timestamp.npy ===")
node_ts = np.load(DIR / "dgraphfinv2_node_timestamp.npy")
print(f"shape={node_ts.shape}, dtype={node_ts.dtype}")
print("sample values:", node_ts[:5])

print("\n=== dgraphfinv2_edge_timestamp.npy ===")
edge_ts = np.load(DIR / "dgraphfinv2_edge_timestamp.npy")
print(f"shape={edge_ts.shape}, dtype={edge_ts.dtype}")
print("sample values:", edge_ts[:5])

# sanity check: do the timestamp array lengths match the base graph's
# node/edge counts?
if "node_feat" in data:
    print(f"\nnode_feat rows: {data['node_feat'].shape[0]} vs node_timestamp length: {node_ts.shape[0]}")
if "edge_index" in data:
    print(f"edge_index count: {data['edge_index'].shape[0]} vs edge_timestamp length: {edge_ts.shape[0]}")