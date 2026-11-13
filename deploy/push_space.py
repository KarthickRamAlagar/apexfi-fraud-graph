"""Create/update the Hugging Face Space that runs the FastAPI backend.

    export HF_TOKEN=hf_xxx            # WRITE token (to create the Space and upload code)
    export HF_SPACE_TOKEN=hf_yyy      # READ token the Space itself will use to download the private repos
    uv run python -m deploy.push_space --user YOUR_HF_USERNAME --origins https://your-app.vercel.app

Only CODE is uploaded (backend/, etl/, ml/*.py, small result JSON files). No data, no models, no .env.
LLM keys for "Ask your data" are read from your local environment / .env and stored as Space SECRETS
(GROQ_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY, CEREBRAS_API_KEY; OPENAI_API_KEY only with --use-openai).
The Space must be public so the browser can call it; the code in it is not secret.
"""
import argparse
import os
import shutil
import tempfile
from pathlib import Path

from dotenv import load_dotenv
from huggingface_hub import HfApi

load_dotenv()

SKIP_NAMES = {"__pycache__", ".pytest_cache", "checkpoints", "node_modules", ".venv"}
SKIP_SUFFIXES = {".pt", ".pkl", ".parquet", ".csv", ".pyc", ".env"}


def copy_code(src: Path, dst: Path, only_suffix=None):
    for p in src.rglob("*"):
        rel = p.relative_to(src)
        if any(part in SKIP_NAMES for part in rel.parts) or p.name.startswith(".env"):
            continue
        if p.is_dir() or p.suffix in SKIP_SUFFIXES:
            continue
        if only_suffix and p.suffix not in only_suffix:
            continue
        out = dst / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, out)


def stage(root: Path, target: Path):
    copy_code(root / "backend", target / "backend")
    copy_code(root / "etl", target / "etl")
    copy_code(root / "ml", target / "ml", only_suffix={".py"})
    (target / "deploy").mkdir(parents=True, exist_ok=True)
    for f in ["__init__.py", "fetch_assets.py"]:
        shutil.copy2(root / "deploy" / f, target / "deploy" / f)
    (target / "streamlit_app" / "data").mkdir(parents=True, exist_ok=True)
    for j in (root / "streamlit_app" / "data").glob("*.json"):
        shutil.copy2(j, target / "streamlit_app" / "data" / j.name)
    for name in ["Dockerfile", "entrypoint.sh", "README.md", "requirements.txt"]:
        shutil.copy2(root / "deploy" / "space" / name, target / name)
    (target / "entrypoint.sh").chmod(0o755)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--user", required=True)
    ap.add_argument("--space", default="apexfi-api")
    ap.add_argument("--origins", required=True, help="comma-separated website addresses allowed to call the API (your Vercel URL)")
    ap.add_argument("--models-repo", default="apexfi-models")
    ap.add_argument("--data-repo", default="apexfi-data")
    ap.add_argument("--use-openai", action="store_true", help="also store OPENAI_API_KEY (paid) - off by default")
    ap.add_argument("--daily-cap", default="500", help="max Ask-your-data questions per day for the whole site")
    args = ap.parse_args()

    token = os.getenv("HF_TOKEN")
    if not token:
        raise SystemExit("Set HF_TOKEN (write access) first.")
    root = Path(__file__).resolve().parent.parent
    api = HfApi(token=token)
    repo = f"{args.user}/{args.space}"

    api.create_repo(repo, repo_type="space", space_sdk="docker", private=False, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        stage(root, Path(tmp))
        n = sum(1 for _ in Path(tmp).rglob("*") if _.is_file())
        print(f"Uploading {n} code files to Space {repo} ...")
        api.upload_folder(repo_id=repo, repo_type="space", folder_path=tmp, commit_message="deploy backend")

    variables = {
        "ALLOWED_ORIGINS": args.origins,
        "HF_MODEL_REPO": f"{args.user}/{args.models_repo}",
        "HF_DATA_REPO": f"{args.user}/{args.data_repo}",
        "ASK_DAILY_CAP": str(args.daily_cap),
        "DUCKDB_MEMORY_LIMIT": "6GB",
        "DUCKDB_THREADS": "2",
    }
    for k, v in variables.items():
        api.add_space_variable(repo, k, v)
    print("Variables set:", ", ".join(variables))

    secrets = {"HF_TOKEN": os.getenv("HF_SPACE_TOKEN")}
    for k in ["GROQ_API_KEY", "MISTRAL_API_KEY", "OPENROUTER_API_KEY", "CEREBRAS_API_KEY"] + (["OPENAI_API_KEY"] if args.use_openai else []):
        secrets[k] = os.getenv(k)
    stored = []
    for k, v in secrets.items():
        if v:
            api.add_space_secret(repo, k, v)
            stored.append(k)
    print("Secrets stored (values are never printed):", ", ".join(stored) or "none")
    if "HF_TOKEN" not in stored:
        print("WARNING: HF_SPACE_TOKEN was not set - the Space cannot download the private repos without it.")

    print(f"\nSpace: https://huggingface.co/spaces/{repo}")
    print(f"API URL (after it finishes building): https://{args.user.lower()}-{args.space}.hf.space")


if __name__ == "__main__":
    main()
