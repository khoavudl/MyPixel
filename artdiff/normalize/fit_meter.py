"""Task 6: Measure alignment fit quality (inlier error + grid shift map) and render inspection visuals."""

from __future__ import annotations

import math
from pathlib import Path
import cv2
import numpy as np

from artdiff.core.models import AlignResult, Artboard, FitReport


def measure_fit(
    a: Artboard,
    b_aligned: np.ndarray,
    valid_mask: np.ndarray,
    align_result: AlignResult,
    inlier_max_err_px: float | None,
    profile: dict,
) -> FitReport:
    """Measure residual alignment error at inliers and across a regular grid."""
    align_cfg = profile.get("align", {})
    grid_cols, grid_rows = align_cfg.get("grid", [10, 4])
    grid_cols = int(grid_cols)
    grid_rows = int(grid_rows)
    max_inlier_rmse_px = float(align_cfg.get("max_inlier_rmse_px", 1.0))
    max_grid_shift_px = float(align_cfg.get("max_grid_shift_px", 1.0))
    min_cell_std = float(align_cfg.get("min_cell_std", 8.0))

    a_gray = cv2.cvtColor(a.img, cv2.COLOR_BGR2GRAY)
    b_gray = cv2.cvtColor(b_aligned, cv2.COLOR_BGR2GRAY)
    h, w = a_gray.shape[:2]

    cell_w = w // grid_cols
    cell_h = h // grid_rows

    grid_shift_px: list[list[float]] = []
    flagged_cells: list[dict] = []
    valid_shifts: list[float] = []

    for r in range(grid_rows):
        row_vals: list[float] = []
        y0 = r * cell_h
        y1 = h if r == grid_rows - 1 else (r + 1) * cell_h
        for c in range(grid_cols):
            x0 = c * cell_w
            x1 = w if c == grid_cols - 1 else (c + 1) * cell_w

            cell_mask = valid_mask[y0:y1, x0:x1]
            if float(np.mean(cell_mask > 0)) < 0.5:
                row_vals.append(float("nan"))
                continue

            cell_a = a_gray[y0:y1, x0:x1].astype(np.float32)
            cell_b = b_gray[y0:y1, x0:x1].astype(np.float32)

            if float(np.std(cell_a)) < min_cell_std or float(np.std(cell_b)) < min_cell_std:
                row_vals.append(float("nan"))
                continue

            win = cv2.createHanningWindow((x1 - x0, y1 - y0), cv2.CV_32F)
            (dx, dy), response = cv2.phaseCorrelate(cell_b, cell_a, window=win)
            shift = float(math.hypot(dx, dy))
            shift_rounded = round(shift, 4)
            row_vals.append(shift_rounded)
            valid_shifts.append(shift_rounded)

            if shift_rounded > max_grid_shift_px:
                flagged_cells.append(
                    {
                        "row": r,
                        "col": c,
                        "bbox_px": [x0, y0, x1 - x0, y1 - y0],
                        "shift_px": shift_rounded,
                        "dx_px": round(float(dx), 4),
                        "dy_px": round(float(dy), 4),
                        "response": round(float(response), 4),
                    }
                )
        grid_shift_px.append(row_vals)

    if valid_shifts:
        raw_max_shift = round(float(max(valid_shifts)), 4)
        p80_shift = round(float(np.percentile(valid_shifts, 80)), 4)
    else:
        raw_max_shift = 0.0
        p80_shift = 0.0

    inlier_rmse = align_result.inlier_rmse_px
    inlier_ok = inlier_rmse is None or inlier_rmse <= max_inlier_rmse_px
    # Pass if inlier RMSE is within threshold AND at least 80% of grid cells (unchanged regions) are within threshold
    grid_ok = p80_shift <= max_grid_shift_px
    passed = bool(align_result.ok and inlier_ok and grid_ok)

    reasons: list[str] = []
    if not inlier_ok:
        reasons.append(
            f"inlier_rmse_px={inlier_rmse:.3f} > max_inlier_rmse_px={max_inlier_rmse_px:.3f}"
        )
    if not grid_ok:
        reasons.append(
            f"grid 80th-percentile shift={p80_shift:.3f} px > max_grid_shift_px={max_grid_shift_px:.3f} px "
            f"(max={raw_max_shift:.3f} px)"
        )
    elif flagged_cells:
        reasons.append(
            f"{len(flagged_cells)} cell(s) exceeded {max_grid_shift_px:.2f} px "
            f"(likely local content modifications; see flagged_cells)"
        )

    return FitReport(
        passed=passed,
        inlier_max_err_px=inlier_max_err_px,
        inlier_rmse_px=inlier_rmse,
        grid_shift_px=grid_shift_px,
        grid_max_shift_px=raw_max_shift,
        flagged_cells=flagged_cells,
        reason="; ".join(reasons) if reasons else None,
    )


def _downscale_visual(img: np.ndarray, max_edge: int = 2048) -> np.ndarray:
    """Downscale image keeping aspect ratio if longest edge > max_edge."""
    if max_edge <= 0:
        return img
    h, w = img.shape[:2]
    longest = max(h, w)
    if longest <= max_edge:
        return img
    scale = float(max_edge) / float(longest)
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)


def save_fit_visuals(
    a: Artboard,
    b_aligned: np.ndarray,
    valid_mask: np.ndarray,
    fit_report: FitReport,
    out_dir: str | Path,
    max_grid_shift_px: float = 1.0,
    max_edge: int = 2048,
) -> dict[str, str]:
    """Generate and save overlay.png, absdiff_heatmap.png, and grid_shift.png."""
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    a_gray = cv2.cvtColor(a.img, cv2.COLOR_BGR2GRAY)
    b_gray = cv2.cvtColor(b_aligned, cv2.COLOR_BGR2GRAY)
    h, w = a_gray.shape[:2]

    # 1. overlay.png: A in Red channel, B_aligned in Cyan (Blue + Green channels)
    overlay = np.zeros((h, w, 3), dtype=np.uint8)
    overlay[:, :, 0] = b_gray  # Blue
    overlay[:, :, 1] = b_gray  # Green
    overlay[:, :, 2] = a_gray  # Red
    overlay_file = out_path / "overlay.png"
    cv2.imwrite(str(overlay_file), _downscale_visual(overlay, max_edge=max_edge))

    # 2. absdiff_heatmap.png: |A - B_aligned| on grayscale, normalized, colormapped, masked
    absdiff = cv2.absdiff(a_gray, b_gray)
    absdiff_masked = cv2.bitwise_and(absdiff, absdiff, mask=valid_mask)
    max_val = int(np.max(absdiff_masked))
    if max_val > 0:
        norm_diff = np.clip(
            absdiff_masked.astype(np.float32) * (255.0 / max(max_val, 32)), 0, 255
        ).astype(np.uint8)
    else:
        norm_diff = absdiff_masked

    # Preserve small 1px defects when downscaling by applying slight dilation
    if max_edge > 0 and max(h, w) > max_edge:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        norm_diff = cv2.dilate(norm_diff, kernel)

    heatmap = cv2.applyColorMap(norm_diff, cv2.COLORMAP_JET)
    heatmap[valid_mask == 0] = (0, 0, 0)
    heatmap_file = out_path / "absdiff_heatmap.png"
    cv2.imwrite(str(heatmap_file), _downscale_visual(heatmap, max_edge=max_edge))

    # 3. grid_shift.png: grid overlay with per-cell shift and color status
    grid_vis = cv2.addWeighted(a.img, 0.45, b_aligned, 0.45, 25.0)
    tint = grid_vis.copy()
    grid_rows = len(fit_report.grid_shift_px)
    grid_cols = len(fit_report.grid_shift_px[0]) if grid_rows > 0 else 0
    cell_w = w // max(grid_cols, 1)
    cell_h = h // max(grid_rows, 1)

    for r in range(grid_rows):
        y0 = r * cell_h
        y1 = h if r == grid_rows - 1 else (r + 1) * cell_h
        for c in range(grid_cols):
            x0 = c * cell_w
            x1 = w if c == grid_cols - 1 else (c + 1) * cell_w
            val = fit_report.grid_shift_px[r][c]
            if math.isnan(val):
                color = (160, 160, 160)
                text = "NaN"
            elif val <= max_grid_shift_px:
                color = (60, 200, 60)
                text = f"{val:.2f}px"
            else:
                color = (40, 60, 230)
                text = f"{val:.2f}px!"

            cv2.rectangle(tint, (x0, y0), (x1, y1), color, -1)

    grid_vis = cv2.addWeighted(grid_vis, 0.72, tint, 0.28, 0.0)
    font_scale = max(0.45, min(w, h) / 1400.0)
    thickness = max(1, int(round(font_scale * 2.0)))

    for r in range(grid_rows):
        y0 = r * cell_h
        y1 = h if r == grid_rows - 1 else (r + 1) * cell_h
        for c in range(grid_cols):
            x0 = c * cell_w
            x1 = w if c == grid_cols - 1 else (c + 1) * cell_w
            val = fit_report.grid_shift_px[r][c]
            if math.isnan(val):
                border_col = (120, 120, 120)
                text = "NaN"
            elif val <= max_grid_shift_px:
                border_col = (0, 150, 0)
                text = f"{val:.2f}px"
            else:
                border_col = (0, 0, 220)
                text = f"{val:.2f}px"

            cv2.rectangle(grid_vis, (x0, y0), (x1, y1), border_col, 2)
            tx = x0 + max(8, (x1 - x0) // 6)
            ty = y0 + (y1 - y0) // 2
            cv2.putText(
                grid_vis,
                text,
                (tx, ty),
                cv2.FONT_HERSHEY_SIMPLEX,
                font_scale,
                (15, 15, 15),
                thickness + 2,
            )
            cv2.putText(
                grid_vis,
                text,
                (tx, ty),
                cv2.FONT_HERSHEY_SIMPLEX,
                font_scale,
                (250, 250, 250),
                thickness,
            )

    grid_file = out_path / "grid_shift.png"
    cv2.imwrite(str(grid_file), _downscale_visual(grid_vis, max_edge=max_edge))

    return {
        "overlay": str(overlay_file),
        "absdiff_heatmap": str(heatmap_file),
        "grid_shift": str(grid_file),
    }
