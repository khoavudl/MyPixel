"""Native Launcher for MyPixel (ArtDiff).

Starts the local FastAPI server and automatically opens the user's default browser.
Supports macOS and Windows seamlessly.
"""

from __future__ import annotations

import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser

import uvicorn


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

    config = uvicorn.Config(
        app=app,
        host=DEFAULT_HOST,
        port=target_port,
        log_level="info",
        access_log=False,
    )
    server = uvicorn.Server(config)
    server.run()


if __name__ == "__main__":
    main()
