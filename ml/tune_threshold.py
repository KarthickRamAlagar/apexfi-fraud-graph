"""Threshold tuning on an already-trained checkpoint — no retraining, just
reloads the model and sweeps the decision threshold on the validation set
to find a better precision/recall balance than the default 0.5 cutoff,
which our class-weighted loss pushed too far toward over-predicting fraud.

Picks the threshold that maximizes F1 on VALIDATION (not test — test stays
untouched until the very end, so this choice isn't overfit to it), then
reports real metrics at that threshold on the held-out TEST set.
"""
import sys

import torch
import torch.nn.functional as F
import numpy as np
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, average_precision_score, confusion_matrix,
)

from ml.model import FraudGraphSAGE
from ml.simple_sampler import SimpleNeighborLoader


@torch.no_grad()
def get_probs_and_labels(model, loader):
    model.eval()
    all_probs, all_labels = [], []
    for batch in loader:
        out = model(batch.x, batch.edge_index)[: batch.batch_size]
        probs = F.softmax(out, dim=1)[:, 1]
        all_probs.append(probs)
        all_labels.append(batch.y[: batch.batch_size])
    return torch.cat(all_probs).numpy(), torch.cat(all_labels).numpy()


def metrics_at_threshold(labels, probs, threshold):
    preds = (probs >= threshold).astype(int)
    return {
        "threshold": round(float(threshold), 3),
        "accuracy": round(accuracy_score(labels, preds), 4),
        "precision": round(precision_score(labels, preds, zero_division=0), 4),
        "recall": round(recall_score(labels, preds, zero_division=0), 4),
        "f1": round(f1_score(labels, preds, zero_division=0), 4),
        "confusion_matrix": confusion_matrix(labels, preds).tolist(),
    }


def main(dataset_key, graph_path, num_neighbors=(10, 5), batch_size=512):
    print(f"Loading checkpoint for {dataset_key}...")
    checkpoint = torch.load(f"ml/checkpoints/{dataset_key}_model.pt", weights_only=False)
    model = FraudGraphSAGE(
        in_channels=checkpoint["in_channels"], hidden_channels=checkpoint["hidden_channels"]
    )
    model.load_state_dict(checkpoint["state_dict"])

    print(f"Loading graph from {graph_path}...")
    data = torch.load(graph_path, weights_only=False)

    val_loader = SimpleNeighborLoader(
        data, num_neighbors=list(num_neighbors), batch_size=batch_size,
        input_nodes=data.val_mask, shuffle=False,
    )
    test_loader = SimpleNeighborLoader(
        data, num_neighbors=list(num_neighbors), batch_size=batch_size,
        input_nodes=data.test_mask, shuffle=False,
    )

    print("Running inference on validation set to sweep thresholds...")
    val_probs, val_labels = get_probs_and_labels(model, val_loader)

    print("\nThreshold sweep (validation set):")
    print(f"{'Threshold':>10} {'Precision':>10} {'Recall':>10} {'F1':>10}")
    best_f1, best_threshold = -1, 0.5
    for t in np.arange(0.1, 0.95, 0.05):
        m = metrics_at_threshold(val_labels, val_probs, t)
        print(f"{m['threshold']:>10} {m['precision']:>10} {m['recall']:>10} {m['f1']:>10}")
        if m["f1"] > best_f1:
            best_f1 = m["f1"]
            best_threshold = t

    print(f"\nBest threshold on validation: {best_threshold:.3f} (val F1 {best_f1:.4f})")

    print("\nRunning inference on TEST set at this threshold (held out until now)...")
    test_probs, test_labels = get_probs_and_labels(model, test_loader)
    test_result = metrics_at_threshold(test_labels, test_probs, best_threshold)
    test_result["roc_auc"] = round(roc_auc_score(test_labels, test_probs), 4)
    test_result["pr_auc"] = round(average_precision_score(test_labels, test_probs), 4)

    print(f"\nFinal TEST metrics at tuned threshold {best_threshold:.3f}:")
    for k, v in test_result.items():
        print(f"  {k}: {v}")

    print(f"\nFor comparison, default threshold 0.5 on the same test set:")
    default_result = metrics_at_threshold(test_labels, test_probs, 0.5)
    for k, v in default_result.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    dataset_key = sys.argv[1] if len(sys.argv) > 1 else "ieee_cis"
    graph_path = f"{dataset_key}_graph.pt"
    main(dataset_key, graph_path)
