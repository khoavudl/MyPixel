"""Barrel export for artdiff.normalize."""

from artdiff.normalize.aligner import align_artboards, ensure_same_resolution
from artdiff.normalize.cropper import confirm_frame, crop
from artdiff.normalize.fit_meter import measure_fit, save_fit_visuals
from artdiff.normalize.frame_detector import (
    detect_frame,
    detect_frame_raster,
    detect_frame_vector,
    save_frame_preview,
)
from artdiff.normalize.size_gate import check_size

__all__ = [
    "align_artboards",
    "check_size",
    "confirm_frame",
    "crop",
    "detect_frame",
    "detect_frame_raster",
    "detect_frame_vector",
    "ensure_same_resolution",
    "measure_fit",
    "save_fit_visuals",
    "save_frame_preview",
]
