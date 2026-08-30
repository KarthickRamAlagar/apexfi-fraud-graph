"""Extract the GNN's learned node embeddings (not just its final fraud
probability) for every node — a much richer signal than a single scalar
to feed into the ensemble. Uses the output of all layers except the final
classification layer (which collapses everything down to just 2 classes).

Run AFTER retraining on the enriched graph (with the new degree
features), so the embeddings reflect the improved model.
"""
import torch
import torch.nn.functional as F

from ml.model import FraudGraphSAGE
from ml.simple_sampler import SimpleNeighborLoader


@torch.no_grad()
def extract_embeddings(model, data, num_neighbors=(10, 5), batch_size=512):
    model.eval()
    all_mask = torch.ones(data.num_nodes, dtype=torch.bool)

    loader = SimpleNeighborLoader(
        data, num_neighbors=list(num_neighbors), batch_size=batch_size,
        input_nodes=all_mask, shuffle=False,
    )

    all_embeds = []
    for batch in loader:
        x = batch.x
        for conv in model.convs[:-1]:  # stop before the final classification layer
            x = conv(x, batch.edge_index)
            x = F.relu(x)
        all_embeds.append(x[: batch.batch_size])

    return torch.cat(all_embeds, dim=0)


def main(dataset_key="ieee_cis", graph_path="ieee_cis_graph.pt"):
    print(f"Loading checkpoint for {dataset_key}...")
    checkpoint = torch.load(f"ml/checkpoints/{dataset_key}_model.pt", weights_only=False)
    model = FraudGraphSAGE(
        in_channels=checkpoint["in_channels"], hidden_channels=checkpoint["hidden_channels"]
    )
    model.load_state_dict(checkpoint["state_dict"])

    print(f"Loading graph from {graph_path}...")
    data = torch.load(graph_path, weights_only=False)

    if checkpoint["in_channels"] != data.num_node_features:
        print(
            f"WARNING: checkpoint was trained on {checkpoint['in_channels']} features, "
            f"but the current graph has {data.num_node_features}. "
            f"Re-run training on the current graph first (features changed since this checkpoint was saved)."
        )
        return

    print("Extracting embeddings for every node (takes a few minutes, similar to one training epoch)...")
    embeddings = extract_embeddings(model, data)
    print(f"  Embeddings shape: {embeddings.shape}")

    # IEEE-CIS stores transaction_ids, DGraph-Fin stores node_ids — same
    # purpose (safe alignment for later scripts), different attribute name
    ids = getattr(data, "transaction_ids", None)
    if ids is None:
        ids = getattr(data, "node_ids", None)
    if ids is None:
        print("WARNING: no ID field found on this graph (transaction_ids or node_ids) — re-run the graph builder first.")
        return

    output_path = f"ml/checkpoints/{dataset_key}_embeddings.pt"
    torch.save({"embeddings": embeddings, "ids": ids}, output_path)
    print(f"Saved embeddings to {output_path}")


if __name__ == "__main__":
    import sys
    dataset_key = sys.argv[1] if len(sys.argv) > 1 else "ieee_cis"
    graph_path = sys.argv[2] if len(sys.argv) > 2 else f"{dataset_key}_graph.pt"
    main(dataset_key, graph_path)
