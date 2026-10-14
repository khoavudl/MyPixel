"""Native Launcher for MyPixel (ArtDiff).

Starts the local FastAPI server and automatically opens the user's default browser.
Supports macOS and Windows seamlessly.
"""

from __future__ import annotations

from copy import deepcopy
import os
from pathlib import Path
import socket
import sys
import threading
import time
import urllib.request
import webbrowser

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


def wait_and_open_browser(url: str, timeout: float = 10.0) -> None:
    """Wait until the backend server responds to /api/health, then open browser."""
    start_time = time.time()
    health_url = f"{url.rstrip('/')}/api/health"

    while time.time() - start_time < timeout:
        try:
            req = urllib.request.Request(health_url, headers={"User-Agent": "MyPixel-Launcher"})
            with urllib.request.urlopen(req, timeout=0.8) as resp:
                if resp.status == 200:
                    time.sleep(0.3)
                    webbrowser.open(url)
                    return
        except Exception:
            time.sleep(0.3)

    # Fallback: open anyway if timeout reached
    webbrowser.open(url)


def find_available_port(start_port: int = DEFAULT_PORT, max_attempts: int = 20) -> int:
    """Find the first available port starting from start_port."""
    for p in range(start_port, start_port + max_attempts):
        if is_port_available(p):
            return p
    return start_port


def main() -> None:
    """Launcher entry point."""
    target_port = DEFAULT_PORT

    # 1. If port 8000 is already running MyPixel, simply bring up the browser and exit
    if is_mypixel_running(target_port):
        print(f"MyPixel is already running on http://{DEFAULT_HOST}:{target_port}. Opening browser...")
        webbrowser.open(f"http://{DEFAULT_HOST}:{target_port}")
        sys.exit(0)

    # 2. If port 8000 is not available (occupied or not bindable), find the next free port
    if not is_port_available(target_port):
        target_port = find_available_port(start_port=8001)

    app_url = f"http://{DEFAULT_HOST}:{target_port}"
    print(f"Starting MyPixel server at {app_url}...")

    # 3. Launch browser opener in background thread
    opener_thread = threading.Thread(
        target=wait_and_open_browser,
        args=(app_url,),
        daemon=True,
    )
    opener_thread.start()

    # 4. Start uvicorn server in main thread
    # Import the FastAPI app directly so PyInstaller bundles it reliably
    from server.app import app

    safe_log_config = deepcopy(LOGGING_CONFIG)
    for formatter in safe_log_config.get("formatters", {}).values():
        formatter["use_colors"] = False

    config = uvicorn.Config(
        app=app,
        host=DEFAULT_HOST,
        port=target_port,
        log_level="info",
        access_log=False,
        use_colors=False,
        log_config=safe_log_config,
    )
    server = uvicorn.Server(config)
    server.run()


if __name__ == "__main__":
    main()
