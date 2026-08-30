"""A minimal neighbor sampler that avoids the pyg-lib / torch-sparse
dependency — both are notoriously fragile to install on Windows (many
long-open GitHub issues even after "correct" installation, since they
need prebuilt wheels matching an exact torch version that often doesn't
exist for newer/uncommon torch builds).

Not as fast as PyG's C++ sampler, but fully reliable, and adequate for a
CPU quick-first-pass at our batch sizes. Mimics enough of NeighborLoader's
interface (iterate → batches with .x, .edge_index, .y, .batch_size, with
seed nodes always first) to be a drop-in replacement in train_utils.py.
"""
import numpy as np
import torch


class _Batch:
    def __init__(self, x, edge_index, y, batch_size):
        self.x = x
        self.edge_index = edge_index
        self.y = y
        self.batch_size = batch_size


class SharedEdgeStructure:
    """The expensive part (sorting 34M+ edges, building lookup boundaries)
    — built ONCE and shared across train/val/test loaders, since they all
    sample from the exact same graph, just with different seed nodes.
    Building this independently per loader (the original design) tripled
    memory and compute for no reason.
    """
    def __init__(self, edge_index, num_nodes):
        # int32, not int64 — 590K nodes comfortably fits (int32 goes up to
        # ~2.1 billion), and this halves every array built below. Real fix
        # for repeated allocation failures on 8GB hardware, even when
        # "available" memory looked sufficient — a single large allocation
        # needs one CONTIGUOUS block, and smaller arrays are easier to fit
        # even when free memory is fragmented into smaller pieces.
        edge_index_np = edge_index.numpy().astype(np.int32)
        order = np.argsort(edge_index_np[0], kind="stable")
        self.src_sorted = edge_index_np[0][order]
        self.dst_sorted = edge_index_np[1][order]
        del edge_index_np, order  # free intermediates as soon as we're done with them
        self.boundaries = np.searchsorted(self.src_sorted, np.arange(num_nodes + 1))

    def neighbors(self, node):
        start, end = self.boundaries[node], self.boundaries[node + 1]
        return self.dst_sorted[start:end]


class SimpleNeighborLoader:
    def __init__(self, data, num_neighbors, batch_size, input_nodes, shuffle=False, edge_structure=None):
        self.x = data.x
        self.y = data.y
        self.num_neighbors = list(num_neighbors)
        self.batch_size = batch_size
        self.shuffle = shuffle
        self.seed_nodes = input_nodes.nonzero(as_tuple=True)[0].numpy()

        # reuse a shared structure if given (the normal path — see
        # train_utils.py, which builds one and passes it to all three
        # loaders); only build our own if none was provided, so this class
        # still works standalone (e.g. extract_gnn_embeddings.py)
        self.edges = edge_structure if edge_structure is not None else SharedEdgeStructure(data.edge_index, data.num_nodes)

    def _neighbors(self, node):
        return self.edges.neighbors(node)

    def _sample_hop(self, nodes, k):
        sampled = []
        for n in nodes:
            neighbors = self._neighbors(n)
            if len(neighbors) == 0:
                continue
            if len(neighbors) > k:
                neighbors = np.random.choice(neighbors, k, replace=False)
            sampled.append(neighbors)
        return np.concatenate(sampled) if sampled else np.array([], dtype=np.int64)

    def __len__(self):
        return (len(self.seed_nodes) + self.batch_size - 1) // self.batch_size

    def __iter__(self):
        seeds = self.seed_nodes.copy()
        if self.shuffle:
            np.random.shuffle(seeds)

        for i in range(0, len(seeds), self.batch_size):
            batch_seeds = seeds[i : i + self.batch_size]

            frontier = batch_seeds
            extra_hops = []
            for k in self.num_neighbors:
                frontier = self._sample_hop(frontier, k)
                if len(frontier) > 0:
                    extra_hops.append(frontier)

            # seed nodes always occupy positions [0:batch_size) — every
            # downstream call relies on this convention (out[:batch_size])
            seed_ordered = list(dict.fromkeys(batch_seeds.tolist()))
            seed_set = set(seed_ordered)
            others = []
            for hop in extra_hops:
                others.extend(hop.tolist())
            other_ordered = list(dict.fromkeys(n for n in others if n not in seed_set))

            unique_nodes = np.array(seed_ordered + other_ordered, dtype=np.int64)
            node_to_local = {int(n): j for j, n in enumerate(unique_nodes)}
            unique_set = set(unique_nodes.tolist())

            local_src, local_dst = [], []
            for n in unique_nodes:
                for nb in self._neighbors(n):
                    if nb in unique_set:
                        local_src.append(node_to_local[int(n)])
                        local_dst.append(node_to_local[int(nb)])

            if local_src:
                edge_index_local = torch.tensor([local_src, local_dst], dtype=torch.long)
            else:
                edge_index_local = torch.zeros((2, 0), dtype=torch.long)

            unique_nodes_t = torch.from_numpy(unique_nodes)
            yield _Batch(
                x=self.x[unique_nodes_t],
                edge_index=edge_index_local,
                y=self.y[unique_nodes_t],
                batch_size=len(seed_ordered),
            )