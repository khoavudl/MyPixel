"""Task 3: Confirm detected frame (auto or interactive) and crop RasterPage into Artboard."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Callable

from artdiff.core.models import (
    ArtDiffError,
    Artboard,
    Frame,
    FrameDetectionReport,
    RasterPage,
)
from artdiff.core.units import bbox_mm_to_px


def confirm_frame(
    report: FrameDetectionReport,
    preview_path: str | Path,
    mode: str = "auto",
    min_auto_confidence: float = 0.9,
    input_fn: Callable[[str], str] = input,
) -> Frame:
    """Confirm or override the detected frame before cropping."""
    if mode == "auto":
        cand = report.selected
        if cand.confidence >= min_auto_confidence and cand.method != "manual":
            return replace(cand, confirmed=True)
        raise ArtDiffError(
            code="FRAME_NOT_CONFIRMED",
            message=(
                f"Auto confirmation failed: method={cand.method}, "
                f"confidence={cand.confidence:.3f} < {min_auto_confidence:.3f}. "
                f"Preview saved at: {preview_path}"
            ),
            exit_code=4,
        )

    if mode != "interactive":
        raise ValueError(f"Unsupported confirmation mode: {mode}")

    target_w, target_h = report.target_size_mm
    print(f"\n--- Frame Confirmation (Target: {target_w:.2f} x {target_h:.2f} mm) ---")
    print(f"Preview image: {preview_path}")
    if report.vector_candidate is not None:
        vc = report.vector_candidate
        print(
            f"  [v] Vector : bbox=({vc.bbox_mm[0]:.2f}, {vc.bbox_mm[1]:.2f}, "
            f"{vc.bbox_mm[2]:.2f}, {vc.bbox_mm[3]:.2f}) mm | conf={vc.confidence:.3f} | "
            f"err=({vc.size_err_mm[0]:.2f}, {vc.size_err_mm[1]:.2f}) mm | {vc.elapsed_ms:.2f} ms"
        )
    if report.raster_candidate is not None:
        rc = report.raster_candidate
        print(
            f"  [r] Raster : bbox=({rc.bbox_mm[0]:.2f}, {rc.bbox_mm[1]:.2f}, "
            f"{rc.bbox_mm[2]:.2f}, {rc.bbox_mm[3]:.2f}) mm | conf={rc.confidence:.3f} | "
            f"err=({rc.size_err_mm[0]:.2f}, {rc.size_err_mm[1]:.2f}) mm | {rc.elapsed_ms:.2f} ms"
        )
    sel = report.selected
    print(
        f"  [y] Default ({sel.method}): bbox=({sel.bbox_mm[0]:.2f}, {sel.bbox_mm[1]:.2f}, "
        f"{sel.bbox_mm[2]:.2f}, {sel.bbox_mm[3]:.2f}) mm | conf={sel.confidence:.3f}"
    )

    while True:
        choice = input_fn(
            "Choose [y] accept default / [v] vector / [r] raster / [e] enter x,y,w,h (mm) / [q] quit: "
        ).strip().lower()

        if choice in ("y", ""):
            if sel.method == "manual" and sel.confidence == 0.0:
                print("No automatic frame available. Please press 'e' to enter x,y,w,h (mm).")
                continue
            return replace(sel, confirmed=True)
        if choice == "v":
            if report.vector_candidate is not None:
                return replace(report.vector_candidate, confirmed=True)
            print("Vector candidate is not available.")
            continue
        if choice == "r":
            if report.raster_candidate is not None:
                return replace(report.raster_candidate, confirmed=True)
            print("Raster candidate is not available.")
            continue
        if choice == "e":
            raw_coords = input_fn("Enter x,y,w,h in mm (e.g. 35.0,24.36,620,250): ").strip()
            try:
                parts = [float(p.strip()) for p in raw_coords.split(",")]
                if len(parts) != 4 or parts[2] <= 0 or parts[3] <= 0:
                    raise ValueError("Need 4 numbers with w > 0 and h > 0")
                x_mm, y_mm, w_mm, h_mm = parts
                return Frame(
                    bbox_mm=(x_mm, y_mm, w_mm, h_mm),
                    method="manual",
                    confidence=1.0,
                    size_err_mm=(abs(w_mm - target_w), abs(h_mm - target_h)),
                    confirmed=True,
                    elapsed_ms=0.0,
                )
            except ValueError as exc:
                print(f"Invalid coordinates: {exc}")
                continue
        if choice == "q":
            raise ArtDiffError(
                code="FRAME_NOT_CONFIRMED",
                message="User aborted frame confirmation.",
                exit_code=4,
            )
        print("Unrecognized option. Please choose y, v, r, e, or q.")


def crop(page: RasterPage, frame: Frame) -> Artboard:
    """Crop RasterPage using a confirmed Frame into an Artboard."""
    if not frame.confirmed:
        raise ArtDiffError(
            code="FRAME_NOT_CONFIRMED",
            message=f"Cannot crop unconfirmed frame for source='{page.source}'.",
            exit_code=4,
        )

    x_px, y_px, w_px, h_px = bbox_mm_to_px(frame.bbox_mm, page.px_per_mm)
    img_h, img_w = page.img.shape[:2]

    x0 = max(0, x_px)
    y0 = max(0, y_px)
    x1 = min(img_w, x_px + w_px)
    y1 = min(img_h, y_px + h_px)

    if x1 <= x0 or y1 <= y0:
        raise ArtDiffError(
            code="INVALID_CROP_BBOX",
            message=(
                f"Crop bbox {frame.bbox_mm} mm -> ({x0}:{x1}, {y0}:{y1}) px "
                f"is empty on image of shape {page.img.shape}."
            ),
            exit_code=4,
        )

    cropped = page.img[y0:y1, x0:x1].copy()
    return Artboard(
        img=cropped,
        px_per_mm=page.px_per_mm,
        size_mm=(frame.bbox_mm[2], frame.bbox_mm[3]),
        frame=frame,
        source=page.source,
        page_number=page.page_number,
        pdf_path=page.pdf_path,
    )
