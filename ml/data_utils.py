"""Shared data-preparation utilities used across GNN training/inference
scripts.
"""
import torch


def normalize_features(data):
    """Z-score standardize node features for GNN use — neural networks are
    highly sensitive to feature scale (unlike tree-based models like
    LightGBM, which are scale-invariant). Stats computed from TRAINING
    rows only, then applied to all rows — same leakage discipline used
    for frequency encoding elsewhere in this project.

    Does NOT modify the underlying saved graph file — this is applied
    fresh each time a script loads the graph for GNN use, so LightGBM
    (which doesn't need this and works fine on raw features) is
    unaffected wherever it reads the same file separately.

    Uses in-place tensor ops (sub_/div_) deliberately — computing this as
    `data.x = (data.x - mean) / std` briefly holds two full copies of the
    feature matrix in memory at once (old + new), which on 8GB hardware
    was enough to cause a hard segfault. In-place ops never allocate a
    second full-size copy.
    """
    train_x = data.x[data.train_mask]
    mean = train_x.mean(dim=0, keepdim=True)
    std = train_x.std(dim=0, keepdim=True)
    std[std == 0] = 1.0  # avoid divide-by-zero for any constant column
    del train_x
    data.x.sub_(mean).div_(std)
    return data
