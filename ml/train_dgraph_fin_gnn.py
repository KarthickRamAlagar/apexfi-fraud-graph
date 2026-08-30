"""Train the DGraph-Fin user fraud GNN.

Prerequisite: uv run python -m ml.build_dgraph_fin_graph_data
"""
import os

import torch

from ml.train_utils import train_gnn

GRAPH_PATH = "dgraph_fin_graph.pt"


def main():
    if not os.path.exists(GRAPH_PATH):
        print(f"Graph file not found: {GRAPH_PATH}")
        print("Run first: uv run python -m ml.build_dgraph_fin_graph_data")
        return

    print(f"Loading graph from {GRAPH_PATH}...")
    data = torch.load(GRAPH_PATH, weights_only=False)
    print(
        f"  {data.num_nodes:,} nodes, {data.num_edges:,} edges, "
        f"{data.num_node_features} features"
    )

    train_gnn(
        data, dataset_key="dgraph_fin", dataset_label="DGraph-Fin Users",
        weight_dampening=0.5,  # applied from the start — IEEE-CIS showed full inverse-frequency overcorrects
    )


if __name__ == "__main__":
    main()
