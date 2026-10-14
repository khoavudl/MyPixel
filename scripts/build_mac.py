"""Build script to produce standalone MyPixel.app and MyPixel.dmg on macOS."""

from pathlib import Path
import os
import shutil
import subprocess
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT_DIR / "dist"
BUILD_DIR = ROOT_DIR / "build"
SPEC_FILE = ROOT_DIR / "mypixel.spec"
UI_DIST = ROOT_DIR / "ui" / "dist"
ICNS_FILE = ROOT_DIR / "MyPixel.icns"


def check_prerequisites() -> None:
    """Verify all assets and frontend build are ready."""
    if not UI_DIST.is_dir() or not (UI_DIST / "index.html").is_file():
        print("Error: ui/dist/index.html not found. Please run 'npm run build' inside ui/ first.")
        sys.exit(1)

    if not ICNS_FILE.is_file():
        print("Generating app icons...")
        subprocess.run([sys.executable, str(ROOT_DIR / "scripts" / "make_icons.py")], check=True)


def build_app() -> Path:
    """Run PyInstaller with mypixel.spec to build MyPixel.app."""
    print("Building MyPixel.app with PyInstaller...")
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

    app_path = DIST_DIR / "MyPixel.app"
    if not app_path.exists():
        print(f"Error: Expected app bundle at {app_path} was not created.")
        sys.exit(1)

    print(f"\nSuccessfully built macOS App: {app_path}")
    return app_path


def create_packages(app_path: Path) -> dict[str, Path]:
    """Package MyPixel.app into distributable .zip and .dmg."""
    packages: dict[str, Path] = {}
    zip_path = DIST_DIR / "MyPixel-macOS.zip"

    # 1. Create standard macOS zip distribution using ditto
    print(f"Creating portable zip distribution: {zip_path}...")
    if zip_path.exists():
        zip_path.unlink()
    ditto_cmd = [
        "ditto",
        "-c",
        "-k",
        "--sequesterRsrc",
        "--keepParent",
        str(app_path),
        str(zip_path),
    ]
    res_ditto = subprocess.run(ditto_cmd)
    if res_ditto.returncode == 0:
        print(f"Successfully created portable ZIP: {zip_path}")
        packages["zip"] = zip_path

    # 2. Attempt DMG creation if permitted in environment
    dmg_path = DIST_DIR / "MyPixel-macOS.dmg"
    staging_dir = DIST_DIR / "dmg_staging"
    try:
        print(f"Creating installer DMG: {dmg_path}...")
        if staging_dir.exists():
            shutil.rmtree(staging_dir)
        staging_dir.mkdir(parents=True, exist_ok=True)
        shutil.copytree(app_path, staging_dir / "MyPixel.app", symlinks=True)

        apps_link = staging_dir / "Applications"
        if not apps_link.exists():
            os.symlink("/Applications", str(apps_link))

        if dmg_path.exists():
            dmg_path.unlink()

        hdiutil_cmd = [
            "hdiutil",
            "create",
            "-volname", "MyPixel",
            "-srcfolder", str(staging_dir),
            "-ov",
            "-format", "UDZO",
            str(dmg_path),
        ]
        res = subprocess.run(hdiutil_cmd, capture_output=True, text=True)
        if res.returncode == 0 and dmg_path.exists():
            print(f"Successfully created DMG: {dmg_path}")
            packages["dmg"] = dmg_path
        else:
            print("Note: DMG generation skipped (can be run directly on macOS terminal).")
    except Exception as exc:
        print(f"Note: DMG generation skipped ({exc}).")
    finally:
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)

    return packages


def main() -> None:
    if sys.platform != "darwin":
        print("Error: build_mac.py must be run on macOS.")
        sys.exit(1)

    check_prerequisites()
    app_path = build_app()
    packages = create_packages(app_path)
    print("\n" + "=" * 60)
    print("MYPIXEL MACOS BUILD COMPLETE!")
    print(f"1. Standalone App Bundle: {app_path}")
    if "zip" in packages:
        print(f"2. Portable Zip Package: {packages['zip']}")
    if "dmg" in packages:
        print(f"3. Installer DMG:         {packages['dmg']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
