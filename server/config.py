"""Server configuration and path constants supporting macOS & Windows (dev & frozen)."""

from pathlib import Path
import os
import sys

# Determine if running in a frozen bundle (PyInstaller / py2app)
IS_FROZEN = getattr(sys, "frozen", False)

if IS_FROZEN:
    # PyInstaller extracts bundled data files to _MEIPASS (onefile) or beside executable (onedir)
    if hasattr(sys, "_MEIPASS"):
        BUNDLE_DIR = Path(sys._MEIPASS).resolve()
    else:
        BUNDLE_DIR = Path(sys.executable).resolve().parent

    # In packaged mode, user data (runs, uploads, annotations, reports) must live in user's Documents
    # to avoid PermissionError on macOS (/Applications) or Windows (C:\Program Files)
    # and to ensure data persists across app updates.
    custom_data_dir = os.environ.get("MYPIXEL_DATA_DIR")
    if custom_data_dir:
        USER_DATA_DIR = Path(custom_data_dir).expanduser().resolve()
    else:
        # Cross-platform user Documents directory (macOS: ~/Documents/MyPixel, Windows: %USERPROFILE%\Documents\MyPixel)
        USER_DATA_DIR = Path.home() / "Documents" / "MyPixel"

    BASE_DIR = BUNDLE_DIR
    OUT_DIR = USER_DATA_DIR / "out"
else:
    # Normal dev environment
    BUNDLE_DIR = Path(__file__).resolve().parent.parent
    BASE_DIR = BUNDLE_DIR
    custom_data_dir = os.environ.get("MYPIXEL_DATA_DIR")
    if custom_data_dir:
        OUT_DIR = Path(custom_data_dir).expanduser().resolve() / "out"
    else:
        OUT_DIR = BASE_DIR / "out"

PROFILES_DIR = BUNDLE_DIR / "artdiff" / "profiles"
DEFAULT_PROFILE_PATH = PROFILES_DIR / "default.yaml"
UI_DIST_DIR = BUNDLE_DIR / "ui" / "dist"
FONTS_DIR = BUNDLE_DIR / "assets" / "fonts"
ARIAL_FONT_PATH = FONTS_DIR / "Arial.ttf"

# Find logo: check BUNDLE_DIR first, then UI assets
LOGO_PATH = BUNDLE_DIR / "Logo-fes.png"
if not LOGO_PATH.is_file():
    LOGO_PATH = BUNDLE_DIR / "ui" / "src" / "assets" / "fes.png"

# Ensure output root exists safely
try:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
except Exception:
    pass

