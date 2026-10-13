"""Data contracts (dataclasses) and custom error types for ARTDIFF Phase 1."""

from __future__ import annotations

from dataclasses import dataclass, field
import numpy as np


class ArtDiffError(Exception):
    """Base exception with explicit error code for pipeline traceability."""

    def __init__(self, code: str, message: str, exit_code: int = 1) -> None:
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message
        self.exit_code = exit_code


@dataclass
class VectorRectCandidate:
    bbox_mm: tuple[float, float, float, float]  # x, y, w, h (mm)
    stroke_color: tuple[float, ...] | None = None
    fill_color: tuple[float, ...] | None = None
    source_type: str = "rect"  # "rect" | "path_bbox" | "line_group"


@dataclass
class RasterPage:
    img: np.ndarray  # BGR uint8
    px_per_mm: float
    page_size_mm: tuple[float, float]  # (width_mm, height_mm)
    trimbox_mm: tuple[float, float, float, float] | None  # x, y, w, h
    cropbox_mm: tuple[float, float, float, float] | None  # x, y, w, h
    ocg_layers: list[str]
    vector_candidates: list[VectorRectCandidate]
    source: str  # "brand" | "vendor"
    page_number: int  # 1-based page number
    pdf_path: str


@dataclass
class Frame:
    bbox_mm: tuple[float, float, float, float]  # x, y, w, h on page (mm)
    method: str  # "trimbox" | "pdf_vector" | "opencv_raster" | "manual"
    confidence: float  # 0..1
    size_err_mm: tuple[float, float]  # (|w - W_target|, |h - H_target|)
    confirmed: bool
    elapsed_ms: float = 0.0


@dataclass
class FrameDetectionReport:
    target_size_mm: tuple[float, float]  # (W, H) from user input
    trimbox_candidate: Frame | None
    vector_candidate: Frame | None
    raster_candidate: Frame | None
    selected: Frame


@dataclass
class Artboard:
    img: np.ndarray  # cropped to frame
    px_per_mm: float
    size_mm: tuple[float, float]  # (w, h) in mm
    frame: Frame
    source: str
    page_number: int
    pdf_path: str


@dataclass
class GateResult:
    status: str  # "PASS" | "SCALED_FILE" | "ASPECT_MISMATCH" | "SIZE_MISMATCH"
    passed: bool
    scale_factor_b_to_a: tuple[float, float]  # (scale_x, scale_y)
    aspect_diff: float
    size_diff_mm_a: tuple[float, float]  # (|w_a - W|, |h_a - H|)
    size_diff_mm_b: tuple[float, float]  # (|w_b - W|, |h_b - H|)
    reason: str | None


@dataclass
class AlignResult:
    ok: bool
    transform: list[list[float]]  # 2x3 affine matrix B -> A
    coarse_method: str  # "feature_ransac" | "phase_corr" | "identity"
    fine_method: str | None  # "ecc_masked" | None
    inlier_count: int
    inlier_rmse_px: float | None
    stable_coverage_ratio: float | None
    reason: str | None


@dataclass
class FitReport:
    passed: bool
    inlier_max_err_px: float | None
    inlier_rmse_px: float | None
    grid_shift_px: list[list[float]]  # per-cell residual shift (NaN for flat cells)
    grid_max_shift_px: float
    flagged_cells: list[dict] = field(default_factory=list)
    reason: str | None = None


@dataclass
class DiffRegion:
    id: int  # đánh số trên→dưới, trái→phải
    bbox_mm: tuple[float, float, float, float]  # x, y, w, h trong hệ Artboard
    bbox_px: tuple[int, int, int, int]
    diff_pixels: int
    kind: str  # "content" | "shift_only" | "moved"
    shift_only: bool  # D1
    local_shift_mm: tuple[float, float] | None  # độ dịch cục bộ đã áp / đo được
    source: str  # "grid" | "object:<id>" | "none"
    score: float  # mức tin cậy 0..1


@dataclass
class PdfObject:
    id: str
    side: str  # "A" | "B"
    type: str  # "image" | "vector_group"
    bbox_mm: tuple[float, float, float, float]


@dataclass
class ObjectMatch:
    a_id: str
    b_id: str
    shift_mm: tuple[float, float]
    scale: float
    moved: bool  # |shift| > move_threshold_mm

