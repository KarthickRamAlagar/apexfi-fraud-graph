"""Download the IEEE-CIS Fraud Detection dataset (Kaggle) into data/raw_downloads/.

Requires KAGGLE_USERNAME / KAGGLE_KEY in .env, and that you've joined the
competition on Kaggle's website first (Kaggle requires this before the API
will allow downloads): https://www.kaggle.com/c/ieee-fraud-detection/rules
"""
import os
import zipfile
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# kaggle reads credentials from env vars at import time, so this must run
# after load_dotenv() above.
os.environ.setdefault("KAGGLE_USERNAME", os.getenv("KAGGLE_USERNAME", ""))
os.environ.setdefault("KAGGLE_KEY", os.getenv("KAGGLE_KEY", ""))

from kaggle.api.kaggle_api_extended import KaggleApi  # noqa: E402

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw_downloads" / "ieee_cis"
COMPETITION = "ieee-fraud-detection"


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    api = KaggleApi()
    api.authenticate()

    print(f"Downloading {COMPETITION} into {RAW_DIR} ...")
    api.competition_download_files(COMPETITION, path=str(RAW_DIR))

    zip_path = RAW_DIR / f"{COMPETITION}.zip"
    if zip_path.exists():
        print("Unzipping...")
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(RAW_DIR)
        print("Done. Files:", [p.name for p in RAW_DIR.iterdir()])
    else:
        print("No zip found — check that you've joined the competition rules on Kaggle first.")


if __name__ == "__main__":
    main()