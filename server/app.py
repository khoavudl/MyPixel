"""FastAPI backend application for MyPixel (ARTDIFF)."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import subprocess
import sys
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

from artdiff.core.models import Frame
from artdiff.ingest.pdf_renderer import render_page
from artdiff.normalize.cropper import confirm_frame, crop
from artdiff.normalize.frame_detector import detect_frame
from artdiff.pipeline_phase1 import parse_size_mm
import cv2
import yaml
from server.config import DEFAULT_PROFILE_PATH, OUT_DIR, UI_DIST_DIR
from server.exporter import export_audit_report
from server.runner import runner
from server.schemas import (
    AnalyzeResponse,
    Annotation,
    AnnotationsPayload,
    ExportRequest,
    PastRunSummary,
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
    target_size_mm: Annotated[str, Form()] = "",
    brand_page: Annotated[int, Form()] = 1,
    vendor_page: Annotated[int, Form()] = 1,
    mode: Annotated[str, Form()] = "auto",
    crop_mode: Annotated[str, Form()] = "auto",
) -> AnalyzeResponse:
    """Upload Brand and Vendor PDFs and trigger Phase 1 analysis pipeline in the background."""
    is_full = crop_mode in ("full", "full_page") or not target_size_mm.strip()
    if is_full:
        size_tuple = None
        pipeline_mode = "full_page"
    else:
        try:
            size_tuple = parse_size_mm(target_size_mm)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid target size: {str(exc)}")
        pipeline_mode = mode

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
        mode=pipeline_mode,
    )

    return AnalyzeResponse(
        run_id=run_id,
        status="STARTING",
        message="Pipeline initiated. Connect to WebSocket /ws/runs/{run_id} for real-time logs.",
    )


@app.post("/api/inspect_single", response_model=RunStatusResponse)
async def inspect_single_artwork(
    file: Annotated[UploadFile, File(...)],
    page: Annotated[int, Form()] = 1,
    target_size_mm: Annotated[str, Form()] = "",
    crop_mode: Annotated[str, Form()] = "auto",
) -> RunStatusResponse:
    """Ingest a single artwork file (PDF or image) for single-frame inspection workspace."""
    run_id = f"single_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_%f')}"
    run_dir = OUT_DIR / run_id
    upload_dir = run_dir / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    filename = file.filename or "artwork.pdf"
    file_path = upload_dir / filename
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    out_img = None
    final_size_mm: list[float] = [0.0, 0.0]

    if file_path.suffix.lower() == ".pdf":
        raster_page = render_page(file_path, page_number=page, px_per_mm=11.811, source="single")
        profile = {}
        if DEFAULT_PROFILE_PATH.is_file():
            try:
                with open(DEFAULT_PROFILE_PATH, "r", encoding="utf-8") as pf:
                    profile = yaml.safe_load(pf) or {}
            except Exception:
                pass

        if target_size_mm.strip() and crop_mode == "auto":
            try:
                size_tuple = parse_size_mm(target_size_mm)
                det_report = detect_frame(raster_page, size_tuple, profile)
                if det_report.selected.confidence >= 0.8:
                    confirmed = confirm_frame(det_report, preview_path=run_dir / "frame_preview.png", mode="auto", min_auto_confidence=0.8)
                    artboard = crop(raster_page, confirmed)
                    out_img = artboard.img
                    final_size_mm = [float(artboard.size_mm[0]), float(artboard.size_mm[1])]
                else:
                    out_img = raster_page.img
                    final_size_mm = [float(raster_page.page_size_mm[0]), float(raster_page.page_size_mm[1])]
            except Exception:
                out_img = raster_page.img
                final_size_mm = [float(raster_page.page_size_mm[0]), float(raster_page.page_size_mm[1])]
        else:
            out_img = raster_page.img
            final_size_mm = [float(raster_page.page_size_mm[0]), float(raster_page.page_size_mm[1])]
    else:
        out_img = cv2.imread(str(file_path))
        if out_img is None:
            raise HTTPException(status_code=400, detail="Không thể đọc định dạng ảnh được tải lên")
        h_px, w_px = out_img.shape[:2]
        if target_size_mm.strip():
            try:
                st = parse_size_mm(target_size_mm)
                final_size_mm = [float(st[0]), float(st[1])]
            except Exception:
                final_size_mm = [round(w_px / 11.811, 2), round(h_px / 11.811, 2)]
        else:
            final_size_mm = [round(w_px / 11.811, 2), round(h_px / 11.811, 2)]

    # Save processed single-view image
    single_path = run_dir / "single_cropped.png"
    brand_path = run_dir / "brand_cropped.png"
    cv2.imwrite(str(single_path), out_img)
    cv2.imwrite(str(brand_path), out_img)

    report = {
        "run_id": run_id,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "mode": "single",
        "run_type": "single",
        "status": "PASS",
        "exit_code": 0,
        "target_size_mm": final_size_mm,
        "inputs": {
            "single": {
                "filename": filename,
                "page": page,
                "pdf_path": str(file_path),
            }
        },
        "image_size_px": [int(out_img.shape[1]), int(out_img.shape[0])],
    }

    report_path = run_dir / "report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    images = RunImages(
        single_image=f"/api/runs/{run_id}/images/single_cropped.png",
        brand_cropped=f"/api/runs/{run_id}/images/single_cropped.png",
    )

    return RunStatusResponse(
        run_id=run_id,
        status="PASS",
        exit_code=0,
        error=None,
        images=images,
        report=report,
    )


@app.get("/api/runs", response_model=list[PastRunSummary])
async def list_past_runs() -> list[PastRunSummary]:
    """List historical inspection runs from out/ directory sorted newest first."""
    if not OUT_DIR.is_dir():
        return []

    runs: list[PastRunSummary] = []
    for run_dir in OUT_DIR.iterdir():
        if not run_dir.is_dir() or not (run_dir.name.startswith("run_") or run_dir.name.startswith("single_")):
            continue

        report_file = run_dir / "report.json"
        if not report_file.is_file():
            continue

        try:
            with open(report_file, "r", encoding="utf-8") as f:
                report = json.load(f)

            # Check annotations count
            annotations_count = 0
            ann_file = run_dir / "annotations.json"
            if ann_file.is_file():
                try:
                    with open(ann_file, "r", encoding="utf-8") as af:
                        ann_list = json.load(af)
                        if isinstance(ann_list, list):
                            annotations_count = len(ann_list)
                except Exception:
                    pass

            run_type = report.get("run_type") or report.get("mode") or "compare"
            if run_type == "single":
                single_input = report.get("inputs", {}).get("single", {})
                brand_filename = single_input.get("filename") or "Bản Soi Đơn"
                vendor_filename = None
            else:
                brand_input = report.get("inputs", {}).get("brand", {})
                vendor_input = report.get("inputs", {}).get("vendor", {})
                brand_pdf_path = brand_input.get("pdf_path", "")
                vendor_pdf_path = vendor_input.get("pdf_path", "")
                brand_filename = Path(brand_pdf_path).name if brand_pdf_path else None
                vendor_filename = Path(vendor_pdf_path).name if vendor_pdf_path else None

            has_images = (
                (run_dir / "single_cropped.png").is_file()
                or (run_dir / "brand_cropped.png").is_file()
                or (run_dir / "overlay.png").is_file()
            )

            runs.append(
                PastRunSummary(
                    run_id=run_dir.name,
                    timestamp_utc=report.get("timestamp_utc"),
                    status=report.get("status", "UNKNOWN"),
                    run_type=run_type,
                    exit_code=report.get("exit_code"),
                    brand_filename=brand_filename,
                    vendor_filename=vendor_filename,
                    target_size_mm=report.get("target_size_mm"),
                    annotations_count=annotations_count,
                    has_images=has_images,
                )
            )
        except Exception:
            continue

    # Sort newest first by timestamp_utc or run_dir name
    runs.sort(key=lambda r: (r.timestamp_utc or "", r.run_id), reverse=True)
    return runs


@app.get("/api/runs/{run_id}", response_model=RunStatusResponse)
async def get_run_status(run_id: str) -> RunStatusResponse:
    """Fetch status, report, and static image routes for a specific run."""
    run_info = runner.get_run(run_id)
    if not run_info:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")

    run_dir = OUT_DIR / run_id
    images = RunImages()

    # Populate image URLs if the corresponding files exist on disk
    if (run_dir / "single_cropped.png").is_file():
        images.single_image = f"/api/runs/{run_id}/images/single_cropped.png"
        images.brand_cropped = f"/api/runs/{run_id}/images/single_cropped.png"
    elif (run_dir / "brand_cropped.png").is_file():
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


def send_to_trash(path: Path) -> bool:
    """Safely move a file or directory to the macOS Trash (Recycle Bin), or fallback to removal."""
    path = path.resolve()
    if not path.exists():
        return False

    if sys.platform == "darwin":
        try:
            cmd = f'tell application "Finder" to delete POSIX file "{path}"'
            res = subprocess.run(["osascript", "-e", cmd], capture_output=True, text=True, timeout=5)
            if res.returncode == 0 and not path.exists():
                return True
        except Exception:
            pass

    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink(missing_ok=True)
    return True


@app.delete("/api/runs")
async def delete_all_runs() -> dict[str, int | str]:
    """Delete all historical runs and move their folders to the Recycle Bin / Trash."""
    if not OUT_DIR.is_dir():
        return {"status": "deleted_all", "count": 0}

    deleted_count = 0
    errors: list[str] = []

    for run_dir in list(OUT_DIR.iterdir()):
        if not run_dir.is_dir() or not (run_dir.name.startswith("run_") or run_dir.name.startswith("single_")):
            continue
        try:
            send_to_trash(run_dir)
            runner.remove_run(run_dir.name)
            deleted_count += 1
        except Exception as exc:
            errors.append(f"{run_dir.name}: {str(exc)}")

    if errors:
        return {"status": "partial", "count": deleted_count, "errors": "; ".join(errors)}
    return {"status": "deleted_all", "count": deleted_count}


@app.delete("/api/runs/{run_id}")
async def delete_run(run_id: str) -> dict[str, str]:
    """Delete a historical run and move its folder to the Recycle Bin / Trash."""
    if "/" in run_id or "\\" in run_id or ".." in run_id:
        raise HTTPException(status_code=400, detail="Invalid run_id")

    run_dir = OUT_DIR / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")

    try:
        send_to_trash(run_dir)
        runner.remove_run(run_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete run: {str(exc)}")

    return {"status": "deleted", "run_id": run_id}


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
        inspector_name=request.inspector_name,
    )
    media_types = {
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pdf": "application/pdf",
        "html": "text/html",
        "json": "application/json",
    }
    return FileResponse(
        exported_file,
        filename=exported_file.name,
        media_type=media_types.get(request.format, "application/octet-stream"),
    )


# Mount frontend production build if available
if UI_DIST_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(UI_DIST_DIR), html=True), name="frontend")
