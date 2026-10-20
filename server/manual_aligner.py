"""Manual Interactive Alignment Engine for Pre-press Artwork Inspection.

Allows human-in-the-loop interactive visual alignment when automatic
frame detection or size gating fails (e.g. A4 scaled drawings, net/die-cut net drawings).
"""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import shutil
from typing import Any

import cv2
import numpy as np

from artdiff.core.models import RasterPage
from artdiff.core.units import mm_to_px, pt_to_mm, px_to_mm
from artdiff.ingest.pdf_renderer import render_page
from server.config import OUT_DIR


def prepare_alignment(
    brand_path: str | Path,
    vendor_path: str | Path,
    brand_page: int = 1,
    vendor_page: int = 1,
    run_id: str | None = None,
) -> dict[str, Any]:
    """Prepare interactive staging session by rendering lightweight preview images.
    
    Returns preview image URLs and physical dimensions in mm.
    """
    brand_file = Path(brand_path)
    vendor_file = Path(vendor_path)

    if not run_id:
        run_id = f"manual_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_%f')}"

    run_dir = OUT_DIR / run_id
    upload_dir = run_dir / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    dest_brand = upload_dir / brand_file.name
    dest_vendor = upload_dir / vendor_file.name

    if brand_file.resolve() != dest_brand.resolve():
        shutil.copy2(brand_file, dest_brand)
    if vendor_file.resolve() != dest_vendor.resolve():
        shutil.copy2(vendor_file, dest_vendor)

    # Render preview pages at 150 DPI (approx 5.9 px/mm) for smooth 60 FPS UI interaction
    preview_px_per_mm = 5.9055  # 150 DPI

    brand_page_obj = render_page(
        dest_brand, page_number=brand_page, px_per_mm=preview_px_per_mm, source="brand"
    )
    vendor_page_obj = render_page(
        dest_vendor, page_number=vendor_page, px_per_mm=preview_px_per_mm, source="vendor"
    )

    brand_preview_path = run_dir / "preview_brand.png"
    vendor_preview_path = run_dir / "preview_vendor.png"

    cv2.imwrite(str(brand_preview_path), brand_page_obj.img)
    cv2.imwrite(str(vendor_preview_path), vendor_page_obj.img)

    b_w_mm, b_h_mm = brand_page_obj.page_size_mm
    v_w_mm, v_h_mm = vendor_page_obj.page_size_mm

    # Save staging metadata to guarantee Brand and Vendor identity is NEVER swapped
    staging_meta = {
        "run_id": run_id,
        "brand_path": str(dest_brand.resolve()),
        "vendor_path": str(dest_vendor.resolve()),
        "brand_page": brand_page,
        "vendor_page": vendor_page,
        "brand_filename": dest_brand.name,
        "vendor_filename": dest_vendor.name,
    }
    with open(run_dir / "staging_meta.json", "w", encoding="utf-8") as f:
        json.dump(staging_meta, f, indent=2)

    # Check if a previous run had detected frame candidates or existing manual alignment
    initial_crop_bbox_mm = [0.0, 0.0, float(b_w_mm), float(b_h_mm)]
    initial_transform = None
    existing_report = run_dir / "report.json"
    if existing_report.is_file():
        try:
            with open(existing_report, "r", encoding="utf-8") as f:
                rep_data = json.load(f)
                b_cand = rep_data.get("tasks", {}).get("task2_frame_detect", {}).get("brand", {}).get("selected")
                if b_cand and b_cand.get("bbox_mm"):
                    initial_crop_bbox_mm = [float(v) for v in b_cand["bbox_mm"]]
                if "manual_transform" in rep_data:
                    initial_transform = rep_data["manual_transform"]
        except Exception:
            pass

    return {
        "run_id": run_id,
        "brand_image": f"/api/runs/{run_id}/images/preview_brand.png",
        "vendor_image": f"/api/runs/{run_id}/images/preview_vendor.png",
        "brand_size_mm": [round(float(b_w_mm), 2), round(float(b_h_mm), 2)],
        "vendor_size_mm": [round(float(v_w_mm), 2), round(float(v_h_mm), 2)],
        "brand_shape_px": [int(brand_page_obj.img.shape[1]), int(brand_page_obj.img.shape[0])],
        "vendor_shape_px": [int(vendor_page_obj.img.shape[1]), int(vendor_page_obj.img.shape[0])],
        "initial_crop_bbox_mm": [round(v, 2) for v in initial_crop_bbox_mm],
        "brand_filename": dest_brand.name,
        "vendor_filename": dest_vendor.name,
        "brand_page": brand_page,
        "vendor_page": vendor_page,
        "initial_transform": initial_transform,
    }


def apply_alignment(
    run_id: str,
    brand_path: str | Path,
    vendor_path: str | Path,
    brand_page: int,
    vendor_page: int,
    transform: dict[str, float],
    crop_bbox_mm: tuple[float, float, float, float] | list[float] | None = None,
    px_per_mm: float = 11.811,  # Standard 300 DPI for high precision
) -> dict[str, Any]:
    """Apply manual transform parameters, warp Vendor to match Brand, and generate 4 workspace images.
    
    transform dictionary contains:
      - offset_x_mm: float (Vendor top-left X position relative to Brand in mm)
      - offset_y_mm: float (Vendor top-left Y position relative to Brand in mm)
      - scale_x: float (horizontal scale factor)
      - scale_y: float (vertical scale factor)
      - rotation_deg: float (rotation angle in degrees, clockwise)
      
    crop_bbox_mm: (x, y, w, h) in mm on Brand's coordinate space. If None, full Brand page is used.
    """
    run_dir = OUT_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    dest_brand = Path(brand_path)
    dest_vendor = Path(vendor_path)

    # 1. Render Brand page at full 300 DPI
    brand_page_obj = render_page(
        dest_brand, page_number=brand_page, px_per_mm=px_per_mm, source="brand"
    )
    b_img = brand_page_obj.img
    b_h_px, b_w_px = b_img.shape[:2]
    b_w_mm, b_h_mm = brand_page_obj.page_size_mm

    # 2. Determine crop region on Brand
    if crop_bbox_mm and len(crop_bbox_mm) == 4 and crop_bbox_mm[2] > 0 and crop_bbox_mm[3] > 0:
        cx_mm, cy_mm, cw_mm, ch_mm = [float(v) for v in crop_bbox_mm]
    else:
        cx_mm, cy_mm, cw_mm, ch_mm = 0.0, 0.0, float(b_w_mm), float(b_h_mm)

    x0_px = max(0, min(b_w_px - 1, int(round(cx_mm * px_per_mm))))
    y0_px = max(0, min(b_h_px - 1, int(round(cy_mm * px_per_mm))))
    x1_px = max(x0_px + 10, min(b_w_px, int(round((cx_mm + cw_mm) * px_per_mm))))
    y1_px = max(y0_px + 10, min(b_h_px, int(round((cy_mm + ch_mm) * px_per_mm))))

    brand_cropped = b_img[y0_px:y1_px, x0_px:x1_px].copy()
    crop_h_px, crop_w_px = brand_cropped.shape[:2]
    actual_cw_mm = crop_w_px / px_per_mm
    actual_ch_mm = crop_h_px / px_per_mm

    # 3. Determine Vendor rendering resolution:
    # If Vendor is scaled up (e.g. scale ~ 6.0x for A4 scaled engineering nets),
    # we render Vendor at a higher DPI so that vector text and line work remain sharp!
    offset_x_mm = float(transform.get("offset_x_mm", 0.0))
    offset_y_mm = float(transform.get("offset_y_mm", 0.0))
    scale_x = float(transform.get("scale_x", 1.0))
    scale_y = float(transform.get("scale_y", 1.0))
    rotation_deg = float(transform.get("rotation_deg", 0.0))

    avg_scale = 0.5 * (abs(scale_x) + abs(scale_y))
    # Cap upscaling factor to avoid extreme memory allocation, max 45 px/mm (~1140 DPI)
    render_scale = max(1.0, min(4.0, avg_scale))
    vendor_px_per_mm = px_per_mm * render_scale

    vendor_page_obj = render_page(
        dest_vendor, page_number=vendor_page, px_per_mm=vendor_px_per_mm, source="vendor"
    )
    v_img = vendor_page_obj.img
    v_h_px, v_w_px = v_img.shape[:2]
    v_w_mm, v_h_mm = vendor_page_obj.page_size_mm

    # 4. Compute Affine Transformation Matrix
    # We define 3 reference points on Vendor in pixel space:
    # p0 = (0, 0) [Top-Left]
    # p1 = (v_w_px, 0) [Top-Right]
    # p2 = (0, v_h_px) [Bottom-Left]
    src_pts = np.float32([
        [0.0, 0.0],
        [float(v_w_px), 0.0],
        [0.0, float(v_h_px)],
    ])

    # Where do these 3 points map in Brand coordinate space (mm)?
    # Vendor rectangle has center (v_w_mm/2, v_h_mm/2).
    # Its transformed center on Brand is:
    # center_x = offset_x_mm + (v_w_mm * scale_x) / 2
    # center_y = offset_y_mm + (v_h_mm * scale_y) / 2
    #
    # For any point (u, v) on Vendor relative to Vendor's top-left:
    # We rotate around Vendor's center or top-left. Standard: Top-Left at (offset_x, offset_y)
    # Let theta = math.radians(rotation_deg)
    # x_brand = offset_x_mm + scale_x * (u * cos - v * sin)
    # y_brand = offset_y_mm + scale_y * (u * sin + v * cos)
    rad = math.radians(rotation_deg)
    cos_t = math.cos(rad)
    sin_t = math.sin(rad)

    def map_vendor_mm_to_brand_cropped_px(u: float, v: float) -> tuple[float, float]:
        # Position on Brand page in mm
        xb_mm = offset_x_mm + scale_x * (u * cos_t - v * sin_t)
        yb_mm = offset_y_mm + scale_y * (u * sin_t + v * cos_t)
        # Relative to Brand Crop Box top-left (cx_mm, cy_mm)
        xd_mm = xb_mm - cx_mm
        yd_mm = yb_mm - cy_mm
        # In destination cropped pixels
        return (xd_mm * px_per_mm, yd_mm * px_per_mm)

    dst_p0 = map_vendor_mm_to_brand_cropped_px(0.0, 0.0)
    dst_p1 = map_vendor_mm_to_brand_cropped_px(v_w_mm, 0.0)
    dst_p2 = map_vendor_mm_to_brand_cropped_px(0.0, v_h_mm)

    dst_pts = np.float32([dst_p0, dst_p1, dst_p2])

    M = cv2.getAffineTransform(src_pts, dst_pts)

    # Warp Vendor image to match Brand cropped canvas
    # Use white background for prepress packaging canvas
    vendor_aligned = cv2.warpAffine(
        v_img,
        M,
        (crop_w_px, crop_h_px),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(255, 255, 255),
    )

    # 5. Save cropped Brand and aligned Vendor
    brand_out = run_dir / "brand_cropped.png"
    vendor_out = run_dir / "vendor_cropped.png"
    b_aligned_out = run_dir / "B_aligned.png"

    cv2.imwrite(str(brand_out), brand_cropped)
    cv2.imwrite(str(vendor_out), vendor_aligned)
    cv2.imwrite(str(b_aligned_out), vendor_aligned)

    # 6. Generate Diagnostic Images (Overlay & Absdiff Heatmap)
    a_gray = cv2.cvtColor(brand_cropped, cv2.COLOR_BGR2GRAY)
    b_gray = cv2.cvtColor(vendor_aligned, cv2.COLOR_BGR2GRAY)

    # Overlay: Brand in Red, Vendor in Cyan (Blue + Green)
    overlay = np.zeros((crop_h_px, crop_w_px, 3), dtype=np.uint8)
    overlay[:, :, 0] = b_gray  # Blue
    overlay[:, :, 1] = b_gray  # Green
    overlay[:, :, 2] = a_gray  # Red

    overlay_out = run_dir / "overlay.png"
    cv2.imwrite(str(overlay_out), overlay)

    # Heatmap: Absolute Difference normalized with JET colormap
    absdiff = cv2.absdiff(a_gray, b_gray)
    max_val = int(np.max(absdiff))
    if max_val > 0:
        norm_diff = np.clip(
            absdiff.astype(np.float32) * (255.0 / max(max_val, 32)), 0, 255
        ).astype(np.uint8)
    else:
        norm_diff = absdiff

    heatmap = cv2.applyColorMap(norm_diff, cv2.COLORMAP_JET)
    heatmap_out = run_dir / "absdiff_heatmap.png"
    cv2.imwrite(str(heatmap_out), heatmap)

    # 7. Write report.json (Bypasses Task 4 Size Gate with status PASS)
    report = {
        "run_id": run_id,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "mode": "manual_align",
        "run_type": "compare",
        "status": "PASS",
        "exit_code": 0,
        "target_size_mm": [round(actual_cw_mm, 2), round(actual_ch_mm, 2)],
        "inputs": {
            "brand": {
                "pdf_path": str(dest_brand.resolve()),
                "filename": dest_brand.name,
                "page_number": brand_page,
                "page_size_mm": [round(float(b_w_mm), 2), round(float(b_h_mm), 2)],
            },
            "vendor": {
                "pdf_path": str(dest_vendor.resolve()),
                "filename": dest_vendor.name,
                "page_number": vendor_page,
                "page_size_mm": [round(float(v_w_mm), 2), round(float(v_h_mm), 2)],
            },
        },
        "manual_transform": {
            "offset_x_mm": round(offset_x_mm, 4),
            "offset_y_mm": round(offset_y_mm, 4),
            "scale_x": round(scale_x, 6),
            "scale_y": round(scale_y, 6),
            "rotation_deg": round(rotation_deg, 3),
            "crop_bbox_mm": [round(v, 4) for v in (cx_mm, cy_mm, cw_mm, ch_mm)],
        },
        "image_size_px": [crop_w_px, crop_h_px],
    }

    with open(run_dir / "report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    return {
        "run_id": run_id,
        "status": "PASS",
        "exit_code": 0,
        "images": {
            "brand_cropped": f"/api/runs/{run_id}/images/brand_cropped.png",
            "vendor_cropped": f"/api/runs/{run_id}/images/vendor_cropped.png",
            "overlay": f"/api/runs/{run_id}/images/overlay.png",
            "absdiff_heatmap": f"/api/runs/{run_id}/images/absdiff_heatmap.png",
        },
        "report": report,
    }
