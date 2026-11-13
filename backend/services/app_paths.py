"""Where the app's saved results live.

The folder that used to be called streamlit_app/data is now app_data/ (the Streamlit app is gone; the React app
reads these files through the API). During the move both names work: app_data/ is preferred when it exists.
"""
import os

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_new = os.path.join(REPO_ROOT, "app_data")
_old = os.path.join(REPO_ROOT, "streamlit_app", "data")
DATA_DIR = _new if os.path.isdir(_new) else _old


def data_path(name: str) -> str:
    return os.path.join(DATA_DIR, name)
