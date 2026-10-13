"""Pipeline runner and WebSocket connection manager."""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import threading
import time
from typing import Any, Callable

from fastapi import WebSocket

from artdiff.pipeline_phase1 import run_phase1
from server.config import OUT_DIR, DEFAULT_PROFILE_PATH
from server.schemas import LogMessage


class RunManager:
    """Manages active pipeline runs, WebSocket subscribers, and real-time logs."""

    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = {}
        self._runs: dict[str, dict[str, Any]] = {}
        self._logs: dict[str, list[dict[str, Any]]] = {}
        self._lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=4)
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with self._lock:
            # Check in-memory first
            if run_id in self._runs:
                return dict(self._runs[run_id])

        # Check on-disk in out/run_id/report.json
        run_dir = OUT_DIR / run_id
        report_file = run_dir / "report.json"
        if report_file.is_file():
            try:
                with open(report_file, "r", encoding="utf-8") as f:
                    report = json.load(f)
                return {
                    "run_id": run_id,
                    "status": report.get("status", "UNKNOWN"),
                    "exit_code": report.get("exit_code"),
                    "error": report.get("error"),
                    "report": report,
                }
            except Exception:
                pass
        return None

    def get_logs(self, run_id: str) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._logs.get(run_id, []))

    async def register_websocket(self, run_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        with self._lock:
            if run_id not in self._connections:
                self._connections[run_id] = []
            self._connections[run_id].append(websocket)
            replay_logs = list(self._logs.get(run_id, []))

        # Replay any previous logs to the newly connected client
        for log in replay_logs:
            await websocket.send_json(log)

    def unregister_websocket(self, run_id: str, websocket: WebSocket) -> None:
        with self._lock:
            if run_id in self._connections:
                if websocket in self._connections[run_id]:
                    self._connections[run_id].remove(websocket)
                if not self._connections[run_id]:
                    del self._connections[run_id]

    def _sync_broadcast(self, run_id: str, payload: dict[str, Any]) -> None:
        """Called from worker thread to safely broadcast to async WebSocket clients."""
        with self._lock:
            if run_id not in self._logs:
                self._logs[run_id] = []
            self._logs[run_id].append(payload)
            websockets = list(self._connections.get(run_id, []))

        if self._loop and self._loop.is_running() and websockets:
            async def _send_all():
                for ws in websockets:
                    try:
                        await ws.send_json(payload)
                    except Exception:
                        pass
            asyncio.run_coroutine_threadsafe(_send_all(), self._loop)

    def start_pipeline_run(
        self,
        run_id: str,
        brand_pdf: Path | str,
        vendor_pdf: Path | str,
        target_size_mm: tuple[float, float],
        brand_page: int = 1,
        vendor_page: int = 1,
        profile_path: Path | str | None = None,
        mode: str = "auto",
    ) -> None:
        with self._lock:
            self._runs[run_id] = {
                "run_id": run_id,
                "status": "RUNNING",
                "exit_code": None,
                "error": None,
                "report": None,
            }
            if run_id not in self._logs:
                self._logs[run_id] = []

        def _worker():
            def _on_progress(event: dict[str, Any]):
                self._sync_broadcast(run_id, event)

            try:
                exit_code, report, run_dir = run_phase1(
                    brand_pdf=brand_pdf,
                    vendor_pdf=vendor_pdf,
                    target_size_mm=target_size_mm,
                    brand_page=brand_page,
                    vendor_page=vendor_page,
                    profile_path=profile_path or DEFAULT_PROFILE_PATH,
                    mode=mode,
                    out_root=OUT_DIR,
                    run_id=run_id,
                    on_progress=_on_progress,
                )
                with self._lock:
                    self._runs[run_id].update(
                        {
                            "status": report.get("status", "DONE"),
                            "exit_code": exit_code,
                            "error": report.get("error"),
                            "report": report,
                        }
                    )
            except Exception as exc:
                err_msg = str(exc)
                with self._lock:
                    self._runs[run_id].update(
                        {
                            "status": "INTERNAL_ERROR",
                            "exit_code": 1,
                            "error": err_msg,
                        }
                    )
                self._sync_broadcast(
                    run_id,
                    {
                        "type": "error",
                        "task": None,
                        "status": "FAILED",
                        "message": f"Execution failed: {err_msg}",
                        "timestamp": time.time(),
                    },
                )

        self._executor.submit(_worker)


runner = RunManager()
