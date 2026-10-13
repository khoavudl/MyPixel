"""Server configuration and path constants."""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
OUT_DIR = BASE_DIR / "out"
PROFILES_DIR = BASE_DIR / "artdiff" / "profiles"
DEFAULT_PROFILE_PATH = PROFILES_DIR / "default.yaml"
UI_DIST_DIR = BASE_DIR / "ui" / "dist"

# Ensure output root exists
OUT_DIR.mkdir(parents=True, exist_ok=True)
