"""Pydantic schemas for REST API and WebSocket communication."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class LogMessage(BaseModel):
    type: Literal["log", "step_start", "step_end", "complete", "error"] = "log"
    task: str | None = None
    status: Literal["PENDING", "IN_PROGRESS", "SUCCESS", "FAILED"] = "IN_PROGRESS"
    message: str
    timestamp: float
    details: dict[str, Any] | None = None


class AnalyzeResponse(BaseModel):
    run_id: str
    status: str
    message: str


class RunImages(BaseModel):
    brand_cropped: str | None = None
    vendor_cropped: str | None = None
    overlay: str | None = None
    absdiff_heatmap: str | None = None
    grid_vectors: str | None = None
    frame_brand: str | None = None
    frame_vendor: str | None = None
    single_image: str | None = None


class RunStatusResponse(BaseModel):
    run_id: str
    status: str
    exit_code: int | None = None
    error: str | None = None
    images: RunImages
    report: dict[str, Any] | None = None


class Annotation(BaseModel):
    id: str
    norm_x: float = Field(..., ge=0.0, le=1.0)
    norm_y: float = Field(..., ge=0.0, le=1.0)
    norm_w: float = Field(..., ge=0.0, le=1.0)
    norm_h: float = Field(..., ge=0.0, le=1.0)
    bbox_mm: list[float] | None = None  # [x, y, w, h] in mm
    tag: Literal["content", "shift", "barcode", "missing_char", "color", "other"] = "content"
    severity: Literal["critical", "major", "minor"] = "major"
    note: str = ""
    created_at: str | None = None


class AnnotationsPayload(BaseModel):
    run_id: str
    annotations: list[Annotation]


class ExportRequest(BaseModel):
    run_id: str
    format: Literal["docx", "pdf", "html", "json"] = "docx"
    inspector_name: str | None = None


class PastRunSummary(BaseModel):
    run_id: str
    timestamp_utc: str | None = None
    status: str = "UNKNOWN"
    run_type: str = "compare"
    exit_code: int | None = None
    brand_filename: str | None = None
    vendor_filename: str | None = None
    target_size_mm: list[float] | None = None
    annotations_count: int = 0
    has_images: bool = False


class ManualAlignPrepareResponse(BaseModel):
    run_id: str
    brand_image: str
    vendor_image: str
    brand_size_mm: list[float]
    vendor_size_mm: list[float]
    brand_shape_px: list[int]
    vendor_shape_px: list[int]
    initial_crop_bbox_mm: list[float]
    brand_filename: str
    vendor_filename: str
    brand_page: int = 1
    vendor_page: int = 1
    initial_transform: ManualTransform | None = None


class ManualTransform(BaseModel):
    offset_x_mm: float = 0.0
    offset_y_mm: float = 0.0
    scale_x: float = 1.0
    scale_y: float = 1.0
    rotation_deg: float = 0.0
    crop_bbox_mm: list[float] | None = None


class ManualAlignApplyRequest(BaseModel):
    run_id: str
    transform: ManualTransform
    crop_bbox_mm: list[float] | None = None
    brand_page: int = 1
    vendor_page: int = 1


