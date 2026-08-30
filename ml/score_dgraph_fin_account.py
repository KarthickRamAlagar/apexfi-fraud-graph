"""Terminal equivalent of the Score Unlabeled Account page — same real
inference pipeline, no web UI needed. Useful for quick checks or
scripting.

Usage: uv run python -m ml.score_dgraph_fin_account <node_id>
"""
import json
import sys

from ml.dgraph_fin_inference import DGraphFinPredictor


def main():
    if len(sys.argv) < 2:
        print("Usage: uv run python -m ml.score_dgraph_fin_account <node_id>")
        return

    node_id = int(sys.argv[1])
    predictor = DGraphFinPredictor()
    result = predictor.predict(node_id)

    if result is None:
        print(f"\nAccount {node_id} not found in the DGraph-Fin dataset.")
        return

    print(f"\n{json.dumps(result, indent=2)}")


if __name__ == "__main__":
    main()