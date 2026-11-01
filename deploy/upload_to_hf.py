"""Upload models and the exported Gold Parquet files to PRIVATE Hugging Face repos.
Reads files only. Nothing local is changed or deleted.

    export HF_TOKEN=hf_xxx            # a token with WRITE access (never commit or paste it anywhere)
    uv run python -m deploy.upload_to_hf --user YOUR_HF_USERNAME

Creates (private):  YOUR_HF_USERNAME/apexfi-models   (model repo)
                    YOUR_HF_USERNAME/apexfi-data     (dataset repo)
Re-running is safe: files that did not change are skipped.
"""
import argparse
import os
from pathlib import Path

from dotenv import load_dotenv
from huggingface_hub import HfApi

load_dotenv()

MODEL_FILES = ["ieee_cis_graph.pt", "dgraph_fin_graph.pt"]  # loaded from the working directory at run time
CHECKPOINT_DIR = "ml/checkpoints"
PARQUET_DIR = "data/gold_parquet"
EXTRA_DATA_FILES = ["data/raw_downloads/ethereum_fraud.csv"]  # read by the Ethereum predictor


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--user", required=True, help="your Hugging Face username (or organisation)")
    ap.add_argument("--models-repo", default="apexfi-models")
    ap.add_argument("--data-repo", default="apexfi-data")
    ap.add_argument("--skip-models", action="store_true")
    ap.add_argument("--skip-data", action="store_true")
    args = ap.parse_args()

    token = os.getenv("HF_TOKEN")
    if not token:
        raise SystemExit("Set HF_TOKEN first:  export HF_TOKEN=hf_...   (a token with write access)")
    api = HfApi(token=token)
    me = api.whoami()["name"]
    print(f"Logged in to Hugging Face as: {me}")

    if not args.skip_models:
        repo = f"{args.user}/{args.models_repo}"
        api.create_repo(repo, repo_type="model", private=True, exist_ok=True)
        print(f"\n[models] {repo} (private)")
        if not Path(CHECKPOINT_DIR).is_dir():
            raise SystemExit(f"{CHECKPOINT_DIR} not found - run this from the project root.")
        api.upload_folder(repo_id=repo, repo_type="model", folder_path=CHECKPOINT_DIR, path_in_repo=CHECKPOINT_DIR,
                          commit_message="model checkpoints")
        print(f"  uploaded {CHECKPOINT_DIR}/")
        for f in MODEL_FILES:
            if not Path(f).is_file():
                print(f"  SKIP {f} (not found)")
                continue
            print(f"  uploading {f} ({Path(f).stat().st_size / 1e9:.2f} GB) ...")
            api.upload_file(repo_id=repo, repo_type="model", path_or_fileobj=f, path_in_repo=f,
                            commit_message=f"add {f}")
            print(f"  uploaded {f}")

    if not args.skip_data:
        repo = f"{args.user}/{args.data_repo}"
        api.create_repo(repo, repo_type="dataset", private=True, exist_ok=True)
        print(f"\n[data] {repo} (private)")
        if not Path(PARQUET_DIR).is_dir():
            raise SystemExit(f"{PARQUET_DIR} not found - run  uv run python -m scripts.export_gold_parquet  first.")
        api.upload_folder(repo_id=repo, repo_type="dataset", folder_path=PARQUET_DIR, path_in_repo=PARQUET_DIR,
                          allow_patterns=["*.parquet"], commit_message="gold layer as parquet")
        print(f"  uploaded {PARQUET_DIR}/")
        for f in EXTRA_DATA_FILES:
            if Path(f).is_file():
                api.upload_file(repo_id=repo, repo_type="dataset", path_or_fileobj=f, path_in_repo=f,
                                commit_message=f"add {f}")
                print(f"  uploaded {f}")
            else:
                print(f"  SKIP {f} (not found)")

    print("\nDone. Both repos are PRIVATE. Next: uv run python -m deploy.push_space --user", args.user)


if __name__ == "__main__":
    main()
