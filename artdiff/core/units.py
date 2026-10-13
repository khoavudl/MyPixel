"""Unit conversions between mm, PDF points (pt), and pixels (px)."""

from __future__ import annotations

MM_PER_INCH: float = 25.4
PT_PER_INCH: float = 72.0
MM_PER_PT: float = MM_PER_INCH / PT_PER_INCH
PT_PER_MM: float = PT_PER_INCH / MM_PER_INCH


def pt_to_mm(pt: float) -> float:
    """Convert PDF points (1/72 inch) to millimeters."""
    return float(pt) * MM_PER_PT


def mm_to_pt(mm: float) -> float:
    """Convert millimeters to PDF points (1/72 inch)."""
    return float(mm) * PT_PER_MM


def mm_to_px(mm: float, px_per_mm: float) -> float:
    """Convert millimeters to exact floating-point pixels."""
    if px_per_mm <= 0:
        raise ValueError(f"px_per_mm must be positive, got {px_per_mm}")
    return float(mm) * float(px_per_mm)


def mm_to_px_int(mm: float, px_per_mm: float) -> int:
    """Convert millimeters to rounded integer pixels."""
    return int(round(mm_to_px(mm, px_per_mm)))


def px_to_mm(px: float, px_per_mm: float) -> float:
    """Convert pixels to millimeters."""
    if px_per_mm <= 0:
        raise ValueError(f"px_per_mm must be positive, got {px_per_mm}")
    return float(px) / float(px_per_mm)


def zoom_from_px_per_mm(px_per_mm: float) -> float:
    """Compute PyMuPDF Matrix zoom factor from target px_per_mm."""
    if px_per_mm <= 0:
        raise ValueError(f"px_per_mm must be positive, got {px_per_mm}")
    return float(px_per_mm) * MM_PER_PT


def px_per_mm_from_dpi(dpi: float) -> float:
    """Convert DPI (dots per inch) to pixels per millimeter."""
    if dpi <= 0:
        raise ValueError(f"dpi must be positive, got {dpi}")
    return float(dpi) / MM_PER_INCH


def bbox_mm_to_px(
    bbox_mm: tuple[float, float, float, float],
    px_per_mm: float,
) -> tuple[int, int, int, int]:
    """Convert (x, y, w, h) in mm to integer (x, y, w, h) in px."""
    x_mm, y_mm, w_mm, h_mm = bbox_mm
    return (
        mm_to_px_int(x_mm, px_per_mm),
        mm_to_px_int(y_mm, px_per_mm),
        mm_to_px_int(w_mm, px_per_mm),
        mm_to_px_int(h_mm, px_per_mm),
    )


def bbox_px_to_mm(
    bbox_px: tuple[float, float, float, float],
    px_per_mm: float,
) -> tuple[float, float, float, float]:
    """Convert (x, y, w, h) in px to (x, y, w, h) in mm."""
    x_px, y_px, w_px, h_px = bbox_px
    return (
        px_to_mm(x_px, px_per_mm),
        px_to_mm(y_px, px_per_mm),
        px_to_mm(w_px, px_per_mm),
        px_to_mm(h_px, px_per_mm),
    )
