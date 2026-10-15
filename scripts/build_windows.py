"""Build script to produce standalone MyPixel Windows executable distribution."""

from pathlib import Path
import os
import shutil
import subprocess
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT_DIR / "dist"
SPEC_FILE = ROOT_DIR / "mypixel.spec"
UI_DIST = ROOT_DIR / "ui" / "dist"
ICO_FILE = ROOT_DIR / "MyPixel.ico"


def check_prerequisites() -> None:
    """Verify all assets and frontend build are ready."""
    if not UI_DIST.is_dir() or not (UI_DIST / "index.html").is_file():
        print("Error: ui/dist/index.html not found. Please build the frontend first.")
        sys.exit(1)

    if not ICO_FILE.is_file():
        print("Generating Windows app icon...")
        subprocess.run([sys.executable, str(ROOT_DIR / "scripts" / "make_icons.py")], check=True)


def build_app() -> Path:
    """Run PyInstaller with mypixel.spec to build MyPixel on Windows."""
    print("Building MyPixel for Windows with PyInstaller...")
    cache_dir = ROOT_DIR / ".pyi_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PYINSTALLER_CONFIG_DIR"] = str(cache_dir)
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--clean",
        "-y",
        str(SPEC_FILE),
    ]
    subprocess.run(cmd, cwd=str(ROOT_DIR), env=env, check=True)

    dist_folder = DIST_DIR / "MyPixel"
    exe_path = dist_folder / "MyPixel.exe"
    if not exe_path.exists():
        print(f"Error: Expected executable at {exe_path} was not created.")
        sys.exit(1)

    # Ensure MyPixel.exe.config is placed next to MyPixel.exe
    config_src = ROOT_DIR / "MyPixel.exe.config"
    if config_src.is_file():
        shutil.copy2(config_src, dist_folder / "MyPixel.exe.config")
        print(f"Copied .NET runtime config to {dist_folder / 'MyPixel.exe.config'}")

    # Create zip archive for easy distribution
    zip_path = DIST_DIR / "MyPixel-Windows.zip"
    print(f"Creating portable zip distribution: {zip_path}...")
    shutil.make_archive(str(DIST_DIR / "MyPixel-Windows"), "zip", str(dist_folder))

    print("\n" + "=" * 60)
    print("MYPIXEL WINDOWS BUILD COMPLETE!")
    print(f"1. App Folder:    {dist_folder}")
    print(f"2. Portable Zip:  {zip_path}")
    print("=" * 60)
    return exe_path


if __name__ == "__main__":
    check_prerequisites()
    build_app()
