"""Unit tests for MyPixel launcher and desktop window mode."""

import os
import socket
import pytest

from launcher import (
    DEFAULT_HOST,
    DEFAULT_PORT,
    find_available_port,
    is_mypixel_running,
    is_port_available,
    parse_arguments,
    HAS_WEBVIEW,
)


def test_no_proxy_set():
    """Verify that 127.0.0.1 and localhost are added to NO_PROXY."""
    no_proxy = os.environ.get("NO_PROXY", "")
    assert "127.0.0.1" in no_proxy
    assert "localhost" in no_proxy


def test_is_port_available():
    """Port check should report true on an unbound high port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        _, port = s.getsockname()
    # Now port is closed and available
    assert is_port_available(port) is True


def test_find_available_port():
    """Available port discovery should return an integer >= start_port."""
    p = find_available_port(start_port=9100)
    assert isinstance(p, int)
    assert p >= 9100


def test_is_mypixel_running_on_unused_port():
    """Unused port should return False for is_mypixel_running."""
    assert is_mypixel_running(port=59999) is False


def test_parse_arguments(monkeypatch):
    """Test CLI arguments parsing."""
    monkeypatch.setattr("sys.argv", ["launcher.py", "--browser", "--port", "8888"])
    args = parse_arguments()
    assert args.browser is True
    assert args.port == 8888
    assert args.host == DEFAULT_HOST


def test_has_webview():
    """Verify pywebview is available in the virtualenv."""
    assert HAS_WEBVIEW is True


def test_unblock_windows_files(tmp_path, monkeypatch):
    """Verify unblock_windows_files removes Zone.Identifier stream on Windows."""
    from launcher import unblock_windows_files
    import sys

    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)

    dll_file = tmp_path / "test.dll"
    dll_file.write_text("dummy")
    zone_file = tmp_path / "test.dll:Zone.Identifier"
    zone_file.write_text("[ZoneTransfer]\nZoneId=3")

    assert zone_file.exists()
    unblock_windows_files()
    assert not zone_file.exists()


def test_configure_windows_pythonnet(tmp_path, monkeypatch):
    """Verify configure_windows_pythonnet finds python DLL in frozen bundle."""
    from launcher import configure_windows_pythonnet
    import sys

    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)

    py_ver = f"{sys.version_info.major}{sys.version_info.minor}"
    fake_dll = tmp_path / f"python{py_ver}.dll"
    fake_dll.write_text("fake dll")

    monkeypatch.delenv("PYTHONNET_PYDLL", raising=False)
    configure_windows_pythonnet()
    assert os.environ.get("PYTHONNET_PYDLL") == str(fake_dll)
