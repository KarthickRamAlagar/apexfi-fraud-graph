"""Runs when the Space starts: downloads the model files and the Gold Parquet files
from the private Hugging Face repos into the same paths the code already expects.

Needs env vars (set as Space variables / secrets):
    HF_MODEL_REPO  e.g. youruser/apexfi-models
    HF_DATA_REPO   e.g. youruser/apexfi-data
    HF_TOKEN       a READ token (secret) - needed because both repos are private
Files that are already present are not downloaded again.
"""
import os
import sys
import time

from huggingface_hub import snapshot_download


def fetch(repo_id, repo_type, token):
    t0 = time.time()
    print(f"[fetch] {repo_type} {repo_id} ...", flush=True)
    snapshot_download(repo_id=repo_id, repo_type=repo_type, token=token, local_dir=".")
    print(f"[fetch] {repo_id} ready in {time.time() - t0:.0f}s", flush=True)


def main():
    if os.getenv("SKIP_FETCH") == "1":
        print("[fetch] SKIP_FETCH=1 - using files already on disk")
        return
    token = os.getenv("HF_TOKEN")
    models, data = os.getenv("HF_MODEL_REPO"), os.getenv("HF_DATA_REPO")
    if not (models and data and token):
        sys.exit("HF_MODEL_REPO, HF_DATA_REPO and HF_TOKEN must be set (Space settings).")
    fetch(models, "model", token)
    fetch(data, "dataset", token)
    # the repo layout mirrors the project layout (ml/checkpoints, data/gold_parquet, ...), so nothing to move
    for must in ["ieee_cis_graph.pt", "dgraph_fin_graph.pt", "ml/checkpoints", "data/gold_parquet"]:
        if not os.path.exists(must):
            sys.exit(f"Expected {must} after download but it is missing - check the repos.")
    print("[fetch] all assets in place", flush=True)


if __name__ == "__main__":
    main()
