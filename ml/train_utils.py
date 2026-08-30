"""Shared training loop for both datasets. Uses NeighborLoader (mini-batch
neighbor sampling) rather than full-batch training — necessary for CPU-only
hardware on graphs this size.

Defaults here are tuned for a QUICK FIRST PASS (validate the whole
pipeline end-to-end with real numbers) — fewer epochs, smaller neighbor
fanout. Bump epochs/num_neighbors up for a longer, more thorough run once
this is confirmed working.
"""
import json
import os
import time

import torch
import torch.nn.functional as F
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, average_precision_score, confusion_matrix,
)
from ml.model import FraudGraphSAGE
from ml.simple_sampler import SimpleNeighborLoader as NeighborLoader, SharedEdgeStructure
from ml.data_utils import normalize_features

CHECKPOINT_DIR = os.path.join(os.path.dirname(__file__), "checkpoints")
METRICS_DIR = os.path.join(os.path.dirname(__file__), "..", "streamlit_app", "data")


def train_gnn(
    data,
    dataset_key,
    dataset_label,
    epochs=5,
    hidden_channels=64,
    batch_size=512,
    num_neighbors=(10, 5),
    lr=0.005,
    patience=3,
    weight_dampening=1.0,
):
    """weight_dampening: 1.0 = full inverse-frequency class weight (what the
    first pass used — it overcorrected, pushing the model to over-predict
    fraud broadly). 0.5 = sqrt-dampened weight, a standard, gentler
    heuristic for severe imbalance — the class gets meaningfully more
    attention without the model panicking into flagging everything.
    """
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)
    os.makedirs(METRICS_DIR, exist_ok=True)

    device = torch.device("cpu")  # confirmed CPU-only hardware — no CUDA/ROCm available
    data = data.to(device)
    data = normalize_features(data)  # critical for GNN stability — see data_utils.py docstring

    # built ONCE and shared — this is the expensive part (sorting 34M+
    # edges); the original design had each of the 3 loaders below rebuild
    # this independently, tripling memory and compute for no reason
    shared_edges = SharedEdgeStructure(data.edge_index, data.num_nodes)

    train_loader = NeighborLoader(
        data, num_neighbors=list(num_neighbors), batch_size=batch_size,
        input_nodes=data.train_mask, shuffle=True, edge_structure=shared_edges,
    )
    val_loader = NeighborLoader(
        data, num_neighbors=list(num_neighbors), batch_size=batch_size,
        input_nodes=data.val_mask, shuffle=False, edge_structure=shared_edges,
    )
    test_loader = NeighborLoader(
        data, num_neighbors=list(num_neighbors), batch_size=batch_size,
        input_nodes=data.test_mask, shuffle=False, edge_structure=shared_edges,
    )

    train_labels = data.y[data.train_mask]
    n_pos = (train_labels == 1).sum().item()
    n_neg = (train_labels == 0).sum().item()
    full_ratio = n_neg / max(n_pos, 1)
    dampened_ratio = full_ratio ** weight_dampening
    class_weights = torch.tensor([1.0, dampened_ratio], dtype=torch.float)
    print(
        f"Class weights (train set): normal=1.0, fraud={dampened_ratio:.2f} "
        f"(full inverse-frequency would be {full_ratio:.2f}, dampening={weight_dampening})"
    )

    model = FraudGraphSAGE(in_channels=data.num_node_features, hidden_channels=hidden_channels).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)

    best_val_f1 = -1
    epochs_without_improvement = 0
    best_state = None
    epoch = 0

    for epoch in range(1, epochs + 1):
        model.train()
        total_loss = 0
        t0 = time.time()
        for batch in train_loader:
            optimizer.zero_grad()
            out = model(batch.x, batch.edge_index)
            loss = F.cross_entropy(
                out[: batch.batch_size], batch.y[: batch.batch_size], weight=class_weights
            )
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * batch.batch_size

        val_metrics = evaluate(model, val_loader)
        elapsed = time.time() - t0
        print(
            f"Epoch {epoch}/{epochs} - loss {total_loss / data.train_mask.sum().item():.4f} - "
            f"val F1 {val_metrics['f1']:.4f} - val ROC-AUC {val_metrics['roc_auc']:.4f} - "
            f"{elapsed:.1f}s"
        )

        if val_metrics["f1"] > best_val_f1:
            best_val_f1 = val_metrics["f1"]
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
            epochs_without_improvement = 0
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= patience:
                print(f"No val improvement for {patience} epochs - stopping early.")
                break

    model.load_state_dict(best_state)
    test_metrics = evaluate(model, test_loader)
    print(f"\nFinal test metrics: {test_metrics}")

    checkpoint_path = os.path.join(CHECKPOINT_DIR, f"{dataset_key}_model.pt")
    torch.save(
        {"state_dict": best_state, "in_channels": data.num_node_features, "hidden_channels": hidden_channels},
        checkpoint_path,
    )
    print(f"Saved model checkpoint to {checkpoint_path}")

    metrics_out = {
        **test_metrics,
        "dataset": dataset_label,
        "trained_at": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()),
        "epochs_trained": epoch,
        "web_app_url": "http://localhost:5173/investigate",
    }
    metrics_path = os.path.join(METRICS_DIR, f"model_metrics_{dataset_key}.json")
    with open(metrics_path, "w") as f:
        json.dump(metrics_out, f, indent=2)
    print(f"Saved metrics to {metrics_path}")

    return model, test_metrics


@torch.no_grad()
def evaluate(model, loader):
    model.eval()
    all_preds, all_probs, all_labels = [], [], []
    for batch in loader:
        out = model(batch.x, batch.edge_index)[: batch.batch_size]
        probs = F.softmax(out, dim=1)[:, 1]
        preds = out.argmax(dim=1)
        all_preds.append(preds)
        all_probs.append(probs)
        all_labels.append(batch.y[: batch.batch_size])

    preds = torch.cat(all_preds).numpy()
    probs = torch.cat(all_probs).numpy()
    labels = torch.cat(all_labels).numpy()

    return {
        "accuracy": round(accuracy_score(labels, preds), 4),
        "precision": round(precision_score(labels, preds, zero_division=0), 4),
        "recall": round(recall_score(labels, preds, zero_division=0), 4),
        "f1": round(f1_score(labels, preds, zero_division=0), 4),
        "roc_auc": round(roc_auc_score(labels, probs), 4) if len(set(labels)) > 1 else 0.0,
        "pr_auc": round(average_precision_score(labels, probs), 4) if len(set(labels)) > 1 else 0.0,
        "confusion_matrix": confusion_matrix(labels, preds).tolist(),
    }
