"""FastAPI backend application for MyPixel (ARTDIFF)."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
from typing import Annotated

from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from artdiff.pipeline_phase1 import parse_size_mm
from server.config import OUT_DIR, UI_DIST_DIR
from server.exporter import export_audit_report
from server.runner import runner
from server.schemas import (
    AnalyzeResponse,
    Annotation,
    AnnotationsPayload,
    ExportRequest,
    RunImages,
    RunStatusResponse,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    runner.set_loop(asyncio.get_running_loop())
    yield


app = FastAPI(
    title="MyPixel ARTDIFF API",
    description="Backend API and WebSocket stream for packaging artwork inspection.",
    version="2.0.0",
    lifespan=lifespan,
)

# Enable CORS for local Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "MyPixel API"}


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_artwork(
    brand_file: Annotated[UploadFile, File(...)],
    vendor_file: Annotated[UploadFile, File(...)],
    target_size_mm: Annotated[str, Form(...)],
    brand_page: Annotated[int, Form()] = 1,
    vendor_page: Annotated[int, Form()] = 1,
    mode: Annotated[str, Form()] = "auto",
) -> AnalyzeResponse:
    """Upload Brand and Vendor PDFs and trigger Phase 1 analysis pipeline in the background."""
    try:
        size_tuple = parse_size_mm(target_size_mm)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid target size: {str(exc)}")

    run_id = f"run_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_%f')}"
    run_dir = OUT_DIR / run_id
    upload_dir = run_dir / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Save uploaded PDF files
    brand_path = upload_dir / (brand_file.filename or "brand.pdf")
    vendor_path = upload_dir / (vendor_file.filename or "vendor.pdf")

    with open(brand_path, "wb") as f:
        shutil.copyfileobj(brand_file.file, f)
    with open(vendor_path, "wb") as f:
        shutil.copyfileobj(vendor_file.file, f)

    # Start background execution
    runner.start_pipeline_run(
        run_id=run_id,
        brand_pdf=brand_path,
        vendor_pdf=vendor_path,
        target_size_mm=size_tuple,
        brand_page=brand_page,
        vendor_page=vendor_page,
        mode=mode,
    )

    return AnalyzeResponse(
        run_id=run_id,
        status="STARTING",
        message="Pipeline initiated. Connect to WebSocket /ws/runs/{run_id} for real-time logs.",
    )


@app.get("/api/runs/{run_id}", response_model=RunStatusResponse)
async def get_run_status(run_id: str) -> RunStatusResponse:
    """Fetch status, report, and static image routes for a specific run."""
    run_info = runner.get_run(run_id)
    if not run_info:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")

    run_dir = OUT_DIR / run_id
    images = RunImages()

    # Populate image URLs if the corresponding files exist on disk
    if (run_dir / "brand_cropped.png").is_file():
        images.brand_cropped = f"/api/runs/{run_id}/images/brand_cropped.png"
    if (run_dir / "vendor_cropped.png").is_file():
        images.vendor_cropped = f"/api/runs/{run_id}/images/vendor_cropped.png"
    elif (run_dir / "B_aligned.png").is_file():
        images.vendor_cropped = f"/api/runs/{run_id}/images/B_aligned.png"

    if (run_dir / "overlay.png").is_file():
        images.overlay = f"/api/runs/{run_id}/images/overlay.png"
    if (run_dir / "absdiff_heatmap.png").is_file():
        images.absdiff_heatmap = f"/api/runs/{run_id}/images/absdiff_heatmap.png"
    if (run_dir / "grid_vectors.png").is_file():
        images.grid_vectors = f"/api/runs/{run_id}/images/grid_vectors.png"
    if (run_dir / "frame_brand.png").is_file():
        images.frame_brand = f"/api/runs/{run_id}/images/frame_brand.png"
    if (run_dir / "frame_vendor.png").is_file():
        images.frame_vendor = f"/api/runs/{run_id}/images/frame_vendor.png"

    return RunStatusResponse(
        run_id=run_id,
        status=run_info.get("status", "UNKNOWN"),
        exit_code=run_info.get("exit_code"),
        error=run_info.get("error"),
        images=images,
        report=run_info.get("report"),
    )


@app.get("/api/runs/{run_id}/images/{filename}")
async def get_run_image(run_id: str, filename: str) -> FileResponse:
    """Serve generated diagnostic and crop images."""
    file_path = OUT_DIR / run_id / filename
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"Image '{filename}' not found for run '{run_id}'")
    return FileResponse(file_path)


@app.websocket("/ws/runs/{run_id}")
async def websocket_logs(websocket: WebSocket, run_id: str) -> None:
    """Stream real-time pipeline log events to the frontend."""
    await runner.register_websocket(run_id, websocket)
    try:
        while True:
            # Keep connection open; clients can send ping or commands if needed
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        runner.unregister_websocket(run_id, websocket)
    except Exception:
        runner.unregister_websocket(run_id, websocket)


@app.get("/api/runs/{run_id}/annotations", response_model=list[Annotation])
async def get_annotations(run_id: str) -> list[Annotation]:
    """Retrieve saved annotations for a run."""
    ann_path = OUT_DIR / run_id / "annotations.json"
    if not ann_path.is_file():
        return []
    try:
        with open(ann_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return [Annotation(**item) for item in data]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read annotations: {str(exc)}")


@app.post("/api/runs/{run_id}/annotations")
async def save_annotations(run_id: str, payload: AnnotationsPayload) -> dict[str, str]:
    """Save user bounding boxes and defect notes."""
    run_dir = OUT_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    ann_path = run_dir / "annotations.json"
    with open(ann_path, "w", encoding="utf-8") as f:
        json.dump([a.model_dump() for a in payload.annotations], f, indent=2, ensure_ascii=False)
    return {"status": "saved", "count": str(len(payload.annotations))}


@app.post("/api/export")
async def export_report_endpoint(request: ExportRequest) -> FileResponse:
    """Generate and return standalone HTML/JSON audit report."""
    run_dir = OUT_DIR / request.run_id
    ann_path = run_dir / "annotations.json"
    annotations: list[Annotation] = []
    if ann_path.is_file():
        try:
            with open(ann_path, "r", encoding="utf-8") as f:
                raw = json.load(f)
            annotations = [Annotation(**item) for item in raw]
        except Exception:
            pass

    exported_file = export_audit_report(
        run_id=request.run_id,
        annotations=annotations,
        export_format=request.format,
    )
    return FileResponse(
        exported_file,
        filename=exported_file.name,
        media_type="text/html" if request.format == "html" else "application/json",
    )


# Mount frontend production build if available
if UI_DIST_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(UI_DIST_DIR), html=True), name="frontend")
