"""Train the IEEE-CIS transaction fraud GNN.

Prerequisite: uv run python -m ml.build_ieee_cis_graph_data
"""
import os

import torch

from ml.train_utils import train_gnn

GRAPH_PATH = "ieee_cis_graph.pt"


def main():
    if not os.path.exists(GRAPH_PATH):
        print(f"Graph file not found: {GRAPH_PATH}")
        print("Run first: uv run python -m ml.build_ieee_cis_graph_data")
        return

    print(f"Loading graph from {GRAPH_PATH}...")
    data = torch.load(GRAPH_PATH, weights_only=False)
    print(
        f"  {data.num_nodes:,} nodes, {data.num_edges:,} edges, "
        f"{data.num_node_features} features"
    )

    train_gnn(
        data, dataset_key="ieee_cis", dataset_label="IEEE-CIS Transactions",
        weight_dampening=0.5,  # first pass used 1.0 (full weight) and overcorrected — see chat history
    )


if __name__ == "__main__":
    main()
