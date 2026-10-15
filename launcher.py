"""Native Launcher for MyPixel (ArtDiff).

Starts the local FastAPI server and launches either:
- A native desktop window (via PyWebView / WebKit / WebView2) - Default
- Or the user's default web browser (via --browser flag or fallback)

Includes proxy bypass for 127.0.0.1/localhost to prevent corporate proxy interference.
Supports macOS and Windows seamlessly.
"""

from __future__ import annotations

import argparse
from copy import deepcopy
import os
from pathlib import Path
import socket
import sys
import threading
import time
import urllib.request
import webbrowser

# Bypass proxy for loopback addresses to avoid corporate proxy/security intercepting local API
for key in ("NO_PROXY", "no_proxy"):
    current = os.environ.get(key, "")
    if current:
        if "127.0.0.1" not in current:
            os.environ[key] = f"127.0.0.1,localhost,{current}"
    else:
        os.environ[key] = "127.0.0.1,localhost"


def unblock_windows_files() -> None:
    """Remove NTFS Zone.Identifier (Mark of the Web) from files on Windows.

    When users download MyPixel-Windows.zip via a web browser and extract it with
    Windows Explorer, Windows attaches a Zone.Identifier alternate data stream to all
    files. The .NET Framework runtime blocks loading unmanaged assemblies like
    Python.Runtime.dll from the Internet zone unless they are unblocked.
    """
    if sys.platform != "win32":
        return

    check_dirs: list[Path] = []
    if getattr(sys, "frozen", False):
        if hasattr(sys, "_MEIPASS"):
            check_dirs.append(Path(sys._MEIPASS))
        check_dirs.append(Path(sys.executable).parent)

    for d in check_dirs:
        try:
            if not d.is_dir():
                continue
            for ext in ("*.dll", "*.exe", "*.pyd"):
                for p in d.rglob(ext):
                    try:
                        zone_path = f"{p}:Zone.Identifier"
                        if os.path.exists(zone_path):
                            os.remove(zone_path)
                    except Exception:
                        pass
        except Exception:
            pass


def configure_windows_pythonnet() -> None:
    """Configure environment for pythonnet inside PyInstaller bundle on Windows."""
    if sys.platform != "win32":
        return

    unblock_windows_files()

    if getattr(sys, "frozen", False):
        py_ver = f"{sys.version_info.major}{sys.version_info.minor}"
        dll_name = f"python{py_ver}.dll"
        candidates = []
        if hasattr(sys, "_MEIPASS"):
            candidates.append(Path(sys._MEIPASS) / dll_name)
        candidates.append(Path(sys.executable).parent / "_internal" / dll_name)
        candidates.append(Path(sys.executable).parent / dll_name)
        for cand in candidates:
            if cand.is_file():
                os.environ.setdefault("PYTHONNET_PYDLL", str(cand))
                break


# Prepare Windows pythonnet environment before importing webview
configure_windows_pythonnet()

# Try importing pywebview for native desktop window
try:
    import webview
    HAS_WEBVIEW = True
except (ImportError, Exception):
    HAS_WEBVIEW = False


# Ensure sys.stdout and sys.stderr are valid stream objects with isatty() support.
# In PyInstaller windowed mode (console=False on Windows), sys.stdout/stderr are None,
# which causes uvicorn/click/colorama to fail with AttributeError: 'NoneType' object has no attribute 'isatty'.
class SafeStream:
    """Null/file-backed stream that safely handles write/flush/isatty in GUI mode."""

    def __init__(self, log_file: Path | None = None) -> None:
        self.log_file = log_file

    def write(self, data: str) -> int:
        if self.log_file:
            try:
                with open(self.log_file, "a", encoding="utf-8") as f:
                    f.write(data)
            except Exception:
                pass
        return len(data)

    def flush(self) -> None:
        pass

    def isatty(self) -> bool:
        return False


# Setup launcher log path in user documents
log_dir = Path.home() / "Documents" / "MyPixel"
try:
    log_dir.mkdir(parents=True, exist_ok=True)
    launcher_log = log_dir / "launcher.log"
except Exception:
    launcher_log = None

if sys.stdout is None or not hasattr(sys.stdout, "isatty"):
    sys.stdout = SafeStream(launcher_log)
if sys.stderr is None or not hasattr(sys.stderr, "isatty"):
    sys.stderr = SafeStream(launcher_log)
if sys.stdin is None:
    try:
        sys.stdin = open(os.devnull, "r", encoding="utf-8")
    except Exception:
        pass

import uvicorn
from uvicorn.config import LOGGING_CONFIG


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000


def is_port_available(port: int, host: str = DEFAULT_HOST) -> bool:
    """Check if a network port can actually be bound without error."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((host, port))
            return True
    except OSError:
        return False


def is_mypixel_running(port: int = DEFAULT_PORT, host: str = DEFAULT_HOST) -> bool:
    """Check if an existing instance of MyPixel is responding on the port."""
    try:
        url = f"http://{host}:{port}/api/health"
        req = urllib.request.Request(url, headers={"User-Agent": "MyPixel-Launcher"})
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            return resp.status == 200
    except Exception:
        return False


def wait_for_server(url: str, timeout: float = 15.0) -> bool:
    """Wait until the backend server responds with status 200 on /api/health."""
    start_time = time.time()
    health_url = f"{url.rstrip('/')}/api/health"

    while time.time() - start_time < timeout:
        try:
            req = urllib.request.Request(health_url, headers={"User-Agent": "MyPixel-Launcher"})
            with urllib.request.urlopen(req, timeout=0.8) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.2)
    return False


def wait_and_open_browser(url: str, timeout: float = 10.0) -> None:
    """Wait until the backend server responds to /api/health, then open browser."""
    wait_for_server(url, timeout=timeout)
    time.sleep(0.3)
    webbrowser.open(url)


def find_available_port(start_port: int = DEFAULT_PORT, max_attempts: int = 20) -> int:
    """Find the first available port starting from start_port."""
    for p in range(start_port, start_port + max_attempts):
        if is_port_available(p):
            return p
    return start_port


def create_uvicorn_server(host: str, port: int) -> uvicorn.Server:
    """Build configured Uvicorn server instance."""
    from server.app import app

    safe_log_config = deepcopy(LOGGING_CONFIG)
    for formatter in safe_log_config.get("formatters", {}).values():
        formatter["use_colors"] = False

    config = uvicorn.Config(
        app=app,
        host=host,
        port=port,
        log_level="info",
        access_log=False,
        use_colors=False,
        log_config=safe_log_config,
    )
    return uvicorn.Server(config)


def parse_arguments() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description="MyPixel Packaging Artwork Inspection Launcher")
    parser.add_argument(
        "--browser",
        action="store_true",
        default=os.environ.get("MYPIXEL_USE_BROWSER", "0") in ("1", "true", "True"),
        help="Launch in default web browser instead of native desktop window",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"Port to run MyPixel server on (default: {DEFAULT_PORT})",
    )
    parser.add_argument(
        "--host",
        type=str,
        default=DEFAULT_HOST,
        help=f"Host to bind MyPixel server on (default: {DEFAULT_HOST})",
    )
    args, _ = parser.parse_known_args()
    return args


def main() -> None:
    """Launcher entry point."""
    args = parse_arguments()
    target_host = args.host
    target_port = args.port
    use_browser = args.browser or not HAS_WEBVIEW

    # 1. If port is already running MyPixel
    if is_mypixel_running(target_port, host=target_host):
        app_url = f"http://{target_host}:{target_port}"
        print(f"MyPixel is already running on {app_url}.")
        if use_browser:
            print("Opening in default browser...")
            webbrowser.open(app_url)
            sys.exit(0)
        else:
            print("Opening native desktop window...")
            try:
                webview.settings["ALLOW_DOWNLOADS"] = True
                webview.create_window(
                    title="MyPixel - Packaging Artwork Inspection",
                    url=app_url,
                    width=1440,
                    height=920,
                    min_size=(1024, 700),
                    text_select=True,
                )
                webview.start()
                sys.exit(0)
            except Exception as exc:
                print(f"Warning: Failed to launch native desktop window ({exc}).")
                print("Falling back to default web browser...")
                webbrowser.open(app_url)
                sys.exit(0)

    # 2. If port is not available, find next available port
    if not is_port_available(target_port, host=target_host):
        target_port = find_available_port(start_port=target_port + 1)

    app_url = f"http://{target_host}:{target_port}"
    print(f"Starting MyPixel server at {app_url}...")

    if use_browser:
        # Browser Mode: background thread opens browser, main thread runs Uvicorn
        opener_thread = threading.Thread(
            target=wait_and_open_browser,
            args=(app_url,),
            daemon=True,
        )
        opener_thread.start()
        server = create_uvicorn_server(target_host, target_port)
        server.run()
    else:
        # Desktop Native Mode: background thread runs Uvicorn, main thread runs PyWebView
        server = create_uvicorn_server(target_host, target_port)
        server_thread = threading.Thread(target=server.run, daemon=True)
        server_thread.start()

        # Wait until backend is ready before rendering window
        if not wait_for_server(app_url, timeout=15.0):
            print("Warning: Backend health check timed out. Attempting to open window anyway...")

        try:
            webview.settings["ALLOW_DOWNLOADS"] = True
            webview.create_window(
                title="MyPixel - Packaging Artwork Inspection",
                url=app_url,
                width=1440,
                height=920,
                min_size=(1024, 700),
                text_select=True,
            )
            webview.start()
        except Exception as exc:
            print(f"Warning: Failed to launch native desktop window ({exc}).")
            print("Falling back to default web browser...")
            webbrowser.open(app_url)
            # Keep server running in browser fallback mode until user interrupts
            try:
                while server_thread.is_alive():
                    time.sleep(1.0)
            except KeyboardInterrupt:
                pass
        finally:
            print("Closing MyPixel server...")
            server.should_exit = True
            server_thread.join(timeout=2.0)
            sys.exit(0)


if __name__ == "__main__":
    main()
