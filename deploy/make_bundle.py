"""Pack the backend CODE (no data, no models, no secrets) into one file for the Oracle server.

    uv run python -m deploy.make_bundle          # writes apexfi_bundle.tar.gz in the current folder

Then copy it to the server with scp (see docs/DEPLOY_ORACLE.md).
"""
import shutil
import tarfile
import tempfile
from pathlib import Path

from deploy.push_space import copy_code

ROOT = Path(__file__).resolve().parent.parent


def main(out="apexfi_bundle.tar.gz"):
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp) / "apexfi"
        copy_code(ROOT / "backend", t / "backend")
        copy_code(ROOT / "etl", t / "etl")
        copy_code(ROOT / "ml", t / "ml", only_suffix={".py"})
        (t / "deploy").mkdir(parents=True)
        for f in ["__init__.py", "fetch_assets.py"]:
            shutil.copy2(ROOT / "deploy" / f, t / "deploy" / f)
        (t / "streamlit_app" / "data").mkdir(parents=True)
        for j in (ROOT / "streamlit_app" / "data").glob("*.json"):
            shutil.copy2(j, t / "streamlit_app" / "data" / j.name)
        shutil.copy2(ROOT / "deploy" / "space" / "requirements.txt", t / "requirements.txt")
        (t / "server").mkdir()
        for f in (ROOT / "deploy" / "oracle").glob("*"):
            if f.is_file():
                shutil.copy2(f, t / "server" / f.name)
        with tarfile.open(out, "w:gz") as tar:
            tar.add(t, arcname="apexfi")
        n = sum(1 for p in t.rglob("*") if p.is_file())
    print(f"Wrote {out} ({Path(out).stat().st_size / 1e6:.1f} MB, {n} files). Code only - no data, models or keys.")


if __name__ == "__main__":
    main()
