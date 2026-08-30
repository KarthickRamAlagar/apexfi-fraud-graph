"""Real GNN inference for a genuinely NEW transaction — Stage 2.

Rather than inserting the new transaction into the big 590K-node graph
structure (the thing that's caused every OOM/segfault today), this builds
a small, temporary mini-graph: the new transaction + its real matched
neighbors (found via shared card1/deviceinfo) + those neighbors' own real
neighbors (2-hop, matching the trained model's 2-layer architecture) —
and runs the SAME trained GraphSAGE weights on just that small piece.

This is genuine inductive inference, not an approximation — GraphSAGE's
learned weights don't depend on total graph size, only on a node's own
features and its real local neighborhood.
"""
import pickle

import torch
import torch.nn.functional as F

from ml.model import FraudGraphSAGE
from ml.simple_sampler import SharedEdgeStructure
from ml.new_transaction_features import build_feature_vector

GRAPH_PATH = "ieee_cis_graph.pt"
GNN_CHECKPOINT_PATH = "ml/checkpoints/ieee_cis_model.pt"
ARTIFACTS_PATH = "ml/checkpoints/ieee_cis_preprocessing_artifacts.pkl"

MAX_HOP1_NEIGHBORS = 10  # matches the trained sampler's first-hop cap
MAX_HOP2_PER_NODE = 5    # matches the trained sampler's second-hop cap


class NewTransactionGraphScorer:
    def __init__(self):
        print("Loading graph, GNN, and artifacts for new-transaction graph scoring...")
        self.data = torch.load(GRAPH_PATH, weights_only=False)

        checkpoint = torch.load(GNN_CHECKPOINT_PATH, weights_only=False)
        self.gnn = FraudGraphSAGE(
            in_channels=checkpoint["in_channels"], hidden_channels=checkpoint["hidden_channels"]
        )
        self.gnn.load_state_dict(checkpoint["state_dict"])
        self.gnn.eval()

        with open(ARTIFACTS_PATH, "rb") as f:
            self.artifacts = pickle.load(f)

        # same normalization the GNN was actually trained on — computed
        # once here, from the same training rows, same as data_utils.py's
        # normalize_features (kept separate since here we need to apply
        # these exact stats to a NEW node too, not just the saved graph)
        train_x = self.data.x[self.data.train_mask]
        self.mean = train_x.mean(dim=0, keepdim=True)
        self.std = train_x.std(dim=0, keepdim=True)
        self.std[self.std == 0] = 1.0

        # for real 2-hop neighbor lookups, reusing existing real edges
        self.shared_edges = SharedEdgeStructure(self.data.edge_index, self.data.num_nodes)

        print(f"  Ready. {len(self.artifacts['card1_to_indices'])} card1 values, "
              f"{len(self.artifacts['deviceinfo_to_indices'])} device values indexed for neighbor lookup.")

    def _find_hop1_neighbors(self, raw_input: dict) -> dict:
        """Real existing transactions sharing this new transaction's
        card1 or deviceinfo — tracked SEPARATELY by match type, since the
        trained model expects device_shared_degree and card_shared_degree
        as two distinct counts, not one merged number. Verified directly
        against etl/transform/build_ieee_cis_graph.py's real edge
        construction: device_shared <- shared deviceinfo, card_shared <-
        shared card1 (an earlier version of this had these swapped).

        Returns the FULL, uncapped real match lists — degree_shared_degree
        etc. need the TRUE total count (an earlier version of this
        truncated to MAX_HOP1_NEIGHBORS here, which meant a transaction
        with 64 real connections silently reported only ~10 to LightGBM —
        a real, separate bug from the one already fixed). The GNN's
        sampling cap is applied separately, only when building its
        mini-graph, in score() below.
        """
        device_matches = []
        deviceinfo = raw_input.get("deviceinfo")
        if deviceinfo is not None:
            device_matches = self.artifacts["deviceinfo_to_indices"].get(deviceinfo, [])

        card_matches = []
        card1 = raw_input.get("card1")
        if card1 is not None:
            card_matches = self.artifacts["card1_to_indices"].get(card1, [])

        return {"device_shared": device_matches, "card_shared": card_matches}

    def _find_hop2_neighbors(self, hop1_indices: list) -> list:
        """Real existing neighbors OF the hop-1 neighbors, using the
        actual saved graph edges — matches the trained model's 2-layer
        (2-hop) architecture."""
        indices = set()
        for idx in hop1_indices:
            neighbors = self.shared_edges.neighbors(idx)[:MAX_HOP2_PER_NODE]
            indices.update(int(n) for n in neighbors)
        return list(indices - set(hop1_indices))

    def score(self, raw_input: dict) -> dict:
        # 1. find real neighbors FIRST — the resulting real degree counts
        # feed into the feature vector below, fixing a real bug where
        # LightGBM was previously always given 0 regardless of what
        # this lookup actually found
        matches = self._find_hop1_neighbors(raw_input)
        device_matches, card_matches = matches["device_shared"], matches["card_shared"]

        # separate REAL counts for the feature vector — NOT deduplicated
        # against each other, matching how the original training-time
        # degree features were computed (a transaction matching via BOTH
        # device and card correctly counts toward both, exactly as it
        # would if these were real edges in the full graph)
        real_degree_counts = {
            "device_shared_degree": len(device_matches),
            "card_shared_degree": len(card_matches),
        }

        # 2. this new transaction's own feature vector, now WITH the real
        # degree counts just found — this is what LightGBM actually uses
        new_raw_vec = build_feature_vector(raw_input, self.artifacts, real_degree_counts)
        new_feature_tensor = torch.tensor(new_raw_vec, dtype=torch.float)

        # deduplicated combined list for the actual GNN mini-graph edges —
        # capped HERE (not earlier) since this is specifically the GNN's
        # sampling limit, matching how it was trained on capped neighbor
        # samples. The real, uncapped degree counts above are unaffected
        # by this cap — LightGBM sees the true total, the GNN samples a
        # bounded subset of it, exactly as their respective training
        # methodologies each expect.
        hop1_indices = list(set(device_matches) | set(card_matches))[:MAX_HOP1_NEIGHBORS]
        hop2_indices = self._find_hop2_neighbors(hop1_indices)
        all_existing_indices = hop1_indices + hop2_indices

        if not all_existing_indices:
            # genuinely isolated new transaction — no real matches at all.
            # SAGEConv still produces a valid output from the node's own
            # features alone (it combines self-features with neighbor
            # aggregation, not solely dependent on having neighbors), so
            # this is a real, valid, if less-informed, prediction — not
            # an error case.
            mini_x = (new_feature_tensor - self.mean) / self.std
            edge_index_mini = torch.zeros((2, 0), dtype=torch.long)
        else:
            existing_features = self.data.x[all_existing_indices]
            mini_x = torch.cat([new_feature_tensor, existing_features], dim=0)
            mini_x = (mini_x - self.mean) / self.std

            # local re-indexing: new transaction = 0, real neighbors = 1..N
            local_id = {idx: i + 1 for i, idx in enumerate(all_existing_indices)}
            edges = []
            for h1 in hop1_indices:
                edges.append([0, local_id[h1]])
                edges.append([local_id[h1], 0])
            for h1 in hop1_indices:
                for neighbor in self.shared_edges.neighbors(h1)[:MAX_HOP2_PER_NODE]:
                    neighbor = int(neighbor)
                    if neighbor in local_id:
                        edges.append([local_id[h1], local_id[neighbor]])
                        edges.append([local_id[neighbor], local_id[h1]])
            edge_index_mini = torch.tensor(edges, dtype=torch.long).t()

        with torch.no_grad():
            out = self.gnn(mini_x, edge_index_mini)
            probability = F.softmax(out, dim=1)[0, 1].item()

        matched_ids = [int(self.data.transaction_ids[i]) for i in hop1_indices]
        matched_neighbors = self._get_neighbor_display_detail(matched_ids, device_matches, card_matches)

        return {
            "gnn_probability": probability,
            "lightgbm_feature_vector": new_raw_vec,  # reused by the combined predictor, avoids rebuilding it twice
            "real_degree_counts": real_degree_counts,
            # true total, deduplicated — not the GNN's capped sampling
            # subset, so the UI honestly shows how connected this
            # transaction really is, not an artificially small number
            "num_hop1_neighbors": len(set(device_matches) | set(card_matches)),
            "num_hop2_neighbors": len(hop2_indices),
            "matched_transaction_ids": matched_ids,
            "matched_neighbors": matched_neighbors,
        }

    def _get_neighbor_display_detail(self, matched_ids, device_matches, card_matches):
        """Real amount + real historical fraud status for the small,
        capped display set of matched neighbors — needed to render the
        actual TransactionGraph component (same one Investigate uses),
        not just a bare list of IDs.
        """
        if not matched_ids:
            return []

        device_id_set = {int(self.data.transaction_ids[i]) for i in device_matches[:MAX_HOP1_NEIGHBORS]}

        from sqlalchemy import text
        from etl.db.connection import get_engine

        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT transactionid, transactionamt, is_fraud FROM gold.ieee_cis_features "
                    "WHERE transactionid = ANY(:ids)"
                ),
                {"ids": matched_ids},
            ).mappings().fetchall()

        detail_by_id = {r["transactionid"]: r for r in rows}
        neighbors = []
        for tid in matched_ids:
            row = detail_by_id.get(tid)
            if not row:
                continue
            neighbors.append({
                "id": f"TX-{tid}",
                "amount": f"₹{row['transactionamt']:,.2f}",
                "isFlagged": bool(row["is_fraud"]),
                "edgeType": "device_shared" if tid in device_id_set else "card_shared",
            })
        return neighbors