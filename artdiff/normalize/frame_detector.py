"""Task 2: Detect artwork frame (W x H mm) using both PDF Vector and OpenCV Raster methods."""

from __future__ import annotations

from pathlib import Path
import time
import cv2
import numpy as np

from artdiff.core.models import (
    Frame,
    FrameDetectionReport,
    RasterPage,
    VectorRectCandidate,
)
from artdiff.core.units import bbox_mm_to_px, bbox_px_to_mm, mm_to_px, px_to_mm


def _score_bbox_against_target(
    bbox_mm: tuple[float, float, float, float],
    target_size_mm: tuple[float, float],
    page_size_mm: tuple[float, float],
    size_tol_mm: float,
    aspect_tol: float,
) -> tuple[float, tuple[float, float], bool]:
    """Return (size_score 0..1, (err_w, err_h), is_valid_candidate)."""
    x, y, w, h = bbox_mm
    target_w, target_h = target_size_mm
    page_w, page_h = page_size_mm

    if w <= 5.0 or h <= 5.0:
        return 0.0, (abs(w - target_w), abs(h - target_h)), False

    # Reject boxes that exceed page bounds by more than a small margin
    if (
        x < -2.0
        or y < -2.0
        or (x + w) > page_w + 2.0
        or (y + h) > page_h + 2.0
    ):
        return 0.0, (abs(w - target_w), abs(h - target_h)), False

    err_w = abs(w - target_w)
    err_h = abs(h - target_h)

    # Case 1: Direct absolute size match within tolerance window
    max_search_tol = max(size_tol_mm * 3.0, 4.0)
    if err_w <= max_search_tol and err_h <= max_search_tol:
        norm_err = 0.5 * (err_w + err_h) / max(size_tol_mm, 0.5)
        score = max(0.50, 1.0 - 0.15 * norm_err)
        return float(min(1.0, score)), (err_w, err_h), True

    # Case 2: Scaled file match (aspect ratio matches W/H, size is substantial)
    aspect = w / h
    target_aspect = target_w / target_h
    aspect_err = abs(aspect - target_aspect) / max(target_aspect, 1e-6)
    if aspect_err <= aspect_tol * 2.0 and w >= 0.3 * page_w and h >= 0.3 * page_h:
        score = max(0.50, 0.88 - 20.0 * aspect_err)
        return float(score), (err_w, err_h), True

    return 0.0, (err_w, err_h), False


def _detect_from_trimbox(
    page: RasterPage,
    target_size_mm: tuple[float, float],
    size_tol_mm: float,
    aspect_tol: float,
) -> Frame | None:
    """Check if TrimBox or CropBox matches target_size_mm."""
    t0 = time.perf_counter()
    for box_mm in (page.trimbox_mm, page.cropbox_mm):
        if box_mm is None:
            continue
        score, err_mm, valid = _score_bbox_against_target(
            box_mm,
            target_size_mm,
            page.page_size_mm,
            size_tol_mm,
            aspect_tol,
        )
        if valid and score >= 0.85:
            elapsed = (time.perf_counter() - t0) * 1000.0
            return Frame(
                bbox_mm=box_mm,
                method="trimbox",
                confidence=1.0 if max(err_mm) <= size_tol_mm else round(score, 4),
                size_err_mm=err_mm,
                confirmed=False,
                elapsed_ms=round(elapsed, 2),
            )
    return None


def _synthesize_adjacent_panel_candidates(
    candidates: list[VectorRectCandidate],
    target_size_mm: tuple[float, float],
    page_size_mm: tuple[float, float],
) -> list[VectorRectCandidate]:
    """Combine adjacent aligned vector panels (e.g., two 310x250 panels -> 620x250)."""
    target_w, target_h = target_size_mm
    page_w, page_h = page_size_mm

    # Filter clean structural rects/paths/images within page bounds
    panels: list[tuple[float, float, float, float]] = []
    for c in candidates:
        if c.source_type not in ("rect", "path_bbox", "line_group", "image_bbox"):
            continue
        x, y, w, h = c.bbox_mm
        if x < -1.0 or y < -1.0 or (x + w) > page_w + 1.0 or (y + h) > page_h + 1.0:
            continue
        if w >= 0.15 * target_w and h >= 0.15 * target_h:
            panels.append((x, y, w, h))

    # Deduplicate close boxes
    unique_panels: list[tuple[float, float, float, float]] = []
    for p in panels:
        if not any(
            abs(p[0] - q[0]) < 0.3
            and abs(p[1] - q[1]) < 0.3
            and abs(p[2] - q[2]) < 0.3
            and abs(p[3] - q[3]) < 0.3
            for q in unique_panels
        ):
            unique_panels.append(p)

    synthesized: list[VectorRectCandidate] = []
    n = len(unique_panels)
    if n > 80:
        unique_panels = sorted(
            unique_panels, key=lambda b: b[2] * b[3], reverse=True
        )[:80]
        n = len(unique_panels)

    # Check pairwise and row/column unions of aligned panels
    for i in range(n):
        x1, y1, w1, h1 = unique_panels[i]
        for j in range(i + 1, n):
            x2, y2, w2, h2 = unique_panels[j]
            # Horizontally aligned panels (same y and h, touching or overlapping along x)
            if abs(y1 - y2) <= 1.0 and abs(h1 - h2) <= 1.0:
                left = min(x1, x2)
                right = max(x1 + w1, x2 + w2)
                gap = max(x1, x2) - min(x1 + w1, x2 + w2)
                if -2.0 <= gap <= 2.0:
                    y_avg = 0.5 * (y1 + y2)
                    h_avg = 0.5 * (h1 + h2)
                    synthesized.append(
                        VectorRectCandidate(
                            bbox_mm=(left, y_avg, right - left, h_avg),
                            source_type="panel_union",
                        )
                    )
            # Vertically aligned panels (same x and w, touching along y)
            if abs(x1 - x2) <= 1.0 and abs(w1 - w2) <= 1.0:
                top = min(y1, y2)
                bottom = max(y1 + h1, y2 + h2)
                gap = max(y1, y2) - min(y1 + h1, y2 + h2)
                if -2.0 <= gap <= 2.0:
                    x_avg = 0.5 * (x1 + x2)
                    w_avg = 0.5 * (w1 + w2)
                    synthesized.append(
                        VectorRectCandidate(
                            bbox_mm=(x_avg, top, w_avg, bottom - top),
                            source_type="panel_union",
                        )
                    )

    return synthesized


def detect_frame_vector(
    page: RasterPage,
    target_size_mm: tuple[float, float],
    size_tol_mm: float = 1.5,
    aspect_tol: float = 0.003,
) -> Frame | None:
    """Method 1 (pdf_vector): Detect target WxH frame from PDF vector drawings."""
    t0 = time.perf_counter()
    all_candidates = list(page.vector_candidates) + _synthesize_adjacent_panel_candidates(
        page.vector_candidates, target_size_mm, page.page_size_mm
    )

    best_frame: Frame | None = None
    best_rank: float = -1.0

    type_bonus = {
        "rect": 0.03,
        "path_bbox": 0.025,
        "panel_union": 0.025,
        "line_group": 0.015,
        "image_bbox": 0.005,
    }

    for cand in all_candidates:
        score, err_mm, valid = _score_bbox_against_target(
            cand.bbox_mm,
            target_size_mm,
            page.page_size_mm,
            size_tol_mm,
            aspect_tol,
        )
        if not valid:
            continue

        bonus = type_bonus.get(cand.source_type, 0.0)
        total_err = err_mm[0] + err_mm[1]
        # Prefer exact dimension match first, then structural vector source
        rank = score + bonus - 0.01 * total_err
        conf = min(0.99, round(score + min(bonus, 0.02), 4))

        if rank > best_rank:
            best_rank = rank
            elapsed = (time.perf_counter() - t0) * 1000.0
            best_frame = Frame(
                bbox_mm=tuple(round(v, 4) for v in cand.bbox_mm),
                method="pdf_vector",
                confidence=conf,
                size_err_mm=(round(err_mm[0], 4), round(err_mm[1], 4)),
                confirmed=False,
                elapsed_ms=round(elapsed, 2),
            )

    if best_frame is not None:
        best_frame.elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    return best_frame


def _border_edge_support(
    edges: np.ndarray,
    x: int,
    y: int,
    w: int,
    h: int,
    band: int = 2,
) -> float:
    """Compute mean edge presence along the 4 sides of rectangle (x, y, w, h)."""
    img_h, img_w = edges.shape[:2]
    x0 = max(0, x)
    y0 = max(0, y)
    x1 = min(img_w - 1, x + w)
    y1 = min(img_h - 1, y + h)
    if x1 <= x0 + 4 or y1 <= y0 + 4:
        return 0.0

    top_band = edges[max(0, y0 - band) : min(img_h, y0 + band + 1), x0:x1]
    bot_band = edges[max(0, y1 - band) : min(img_h, y1 + band + 1), x0:x1]
    left_band = edges[y0:y1, max(0, x0 - band) : min(img_w, x0 + band + 1)]
    right_band = edges[y0:y1, max(0, x1 - band) : min(img_w, x1 + band + 1)]

    top_cov = float(np.mean( np.max(top_band, axis=0) > 0 )) if top_band.size else 0.0
    bot_cov = float(np.mean( np.max(bot_band, axis=0) > 0 )) if bot_band.size else 0.0
    left_cov = float(np.mean( np.max(left_band, axis=1) > 0 )) if left_band.size else 0.0
    right_cov = float(np.mean( np.max(right_band, axis=1) > 0 )) if right_band.size else 0.0

    return 0.25 * (top_cov + bot_cov + left_cov + right_cov)


def detect_frame_raster(
    page: RasterPage,
    target_size_mm: tuple[float, float],
    size_tol_mm: float = 1.5,
    aspect_tol: float = 0.003,
) -> Frame | None:
    """Method 2 (opencv_raster): Detect target WxH frame purely from rendered image."""
    t0 = time.perf_counter()
    img = page.img
    px_per_mm = page.px_per_mm
    target_w_mm, target_h_mm = target_size_mm
    target_w_px = mm_to_px(target_w_mm, px_per_mm)
    target_h_px = mm_to_px(target_h_mm, px_per_mm)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 1. Edge map for border support scoring and line projection
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    abs_gx = np.abs(gx)
    abs_gy = np.abs(gy)
    edges = cv2.Canny(gray, 40, 120)

    raw_px_candidates: list[tuple[float, float, float, float]] = []

    # Strategy A: Morphological opening on non-white mask to strip thin dimension lines
    non_white = (gray < 248).astype(np.uint8) * 255
    for open_mm in (0.0, 0.8, 1.5, 2.5):
        if open_mm > 0:
            k = max(3, int(round(open_mm * px_per_mm)))
            if k % 2 == 0:
                k += 1
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k, k))
            cleaned = cv2.morphologyEx(non_white, cv2.MORPH_OPEN, kernel)
        else:
            cleaned = non_white

        contours, _ = cv2.findContours(
            cleaned, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE
        )
        for cnt in contours:
            rx, ry, rw, rh = cv2.boundingRect(cnt)
            if rw >= 0.25 * target_w_px and rh >= 0.25 * target_h_px:
                raw_px_candidates.append((float(rx), float(ry), float(rw), float(rh)))

    # Strategy B: Contours on closed Canny edges (catches thin unfilled frame outlines)
    close_k = max(3, int(round(0.8 * px_per_mm)))
    closed_edges = cv2.morphologyEx(
        edges,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (close_k, close_k)),
    )
    edge_contours, _ = cv2.findContours(
        closed_edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE
    )
    for cnt in edge_contours:
        rx, ry, rw, rh = cv2.boundingRect(cnt)
        if rw >= 0.25 * target_w_px and rh >= 0.25 * target_h_px:
            raw_px_candidates.append((float(rx), float(ry), float(rw), float(rh)))

    # Strategy C: 1D Horizontal & Vertical Edge Peak Pairing for target (W_px, H_px)
    # Strong vertical edges separated by ~target_w_px and horizontal edges separated by ~target_h_px
    col_energy = np.mean(abs_gx, axis=0)
    row_energy = np.mean(abs_gy, axis=1)
    tol_px = max(4, int(round(size_tol_mm * 2.0 * px_per_mm)))

    top_y_peaks = _find_1d_pair_peaks(row_energy, int(round(target_h_px)), tol_px, top_k=6)
    left_x_peaks = _find_1d_pair_peaks(col_energy, int(round(target_w_px)), tol_px, top_k=6)

    for y0, y1 in top_y_peaks:
        for x0, x1 in left_x_peaks:
            raw_px_candidates.append((float(x0), float(y0), float(x1 - x0), float(y1 - y0)))

    # Score all raster candidates
    best_frame: Frame | None = None
    best_rank: float = -1.0
    band_px = max(2, int(round(0.4 * px_per_mm)))

    for rx, ry, rw, rh in raw_px_candidates:
        bbox_mm = bbox_px_to_mm((rx, ry, rw, rh), px_per_mm)
        size_score, err_mm, valid = _score_bbox_against_target(
            bbox_mm,
            target_size_mm,
            page.page_size_mm,
            size_tol_mm,
            aspect_tol,
        )
        if not valid:
            continue

        edge_support = _border_edge_support(
            edges, int(round(rx)), int(round(ry)), int(round(rw)), int(round(rh)), band=band_px
        )
        if edge_support < 0.25:
            continue

        conf = round(min(0.98, 0.65 * size_score + 0.35 * edge_support), 4)
        total_err = err_mm[0] + err_mm[1]
        rank = conf - 0.015 * total_err

        if rank > best_rank:
            best_rank = rank
            elapsed = (time.perf_counter() - t0) * 1000.0
            best_frame = Frame(
                bbox_mm=tuple(round(v, 4) for v in bbox_mm),
                method="opencv_raster",
                confidence=conf,
                size_err_mm=(round(err_mm[0], 4), round(err_mm[1], 4)),
                confirmed=False,
                elapsed_ms=round(elapsed, 2),
            )

    if best_frame is not None:
        best_frame.elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    return best_frame


def _find_1d_pair_peaks(
    profile_1d: np.ndarray,
    span_px: int,
    tol_px: int,
    top_k: int = 6,
) -> list[tuple[int, int]]:
    """Find pairs (p0, p1) with p1 - p0 in [span_px - tol_px, span_px + tol_px] maximizing edge energy."""
    length = len(profile_1d)
    if span_px <= 10 or span_px >= length:
        return []

    min_sep = max(3, tol_px // 2)
    # Local maxima filtering
    candidates_p0 = np.arange(0, length - span_px + tol_px)
    if len(candidates_p0) == 0:
        return []

    scored_pairs: list[tuple[float, int, int]] = []
    # Sample local peaks in profile_1d
    threshold = float(np.percentile(profile_1d, 75))
    peak_indices = np.where(profile_1d >= threshold)[0]

    # Coarsen peak_indices to local maxima within window of radius 2
    filtered_peaks: list[int] = []
    for idx in peak_indices:
        lo = max(0, idx - 2)
        hi = min(length, idx + 3)
        if profile_1d[idx] >= np.max(profile_1d[lo:hi]):
            if not filtered_peaks or (idx - filtered_peaks[-1]) >= 2:
                filtered_peaks.append(int(idx))

    for p0 in filtered_peaks:
        low_p1 = max(p0 + 10, p0 + span_px - tol_px)
        high_p1 = min(length - 1, p0 + span_px + tol_px)
        if low_p1 > high_p1:
            continue
        window = profile_1d[low_p1 : high_p1 + 1]
        best_offset = int(np.argmax(window))
        p1 = low_p1 + best_offset
        dist_penalty = abs((p1 - p0) - span_px) / max(tol_px, 1)
        pair_score = float(profile_1d[p0] + profile_1d[p1]) * (1.0 - 0.25 * dist_penalty)
        scored_pairs.append((pair_score, p0, p1))

    scored_pairs.sort(key=lambda item: item[0], reverse=True)
    selected: list[tuple[int, int]] = []
    for _, p0, p1 in scored_pairs:
        if all(abs(p0 - s0) > min_sep or abs(p1 - s1) > min_sep for s0, s1 in selected):
            selected.append((p0, p1))
            if len(selected) >= top_k:
                break
    return selected


def detect_frame(
    page: RasterPage,
    target_size_mm: tuple[float, float],
    profile: dict,
) -> FrameDetectionReport:
    """Run TrimBox, PDF Vector, and OpenCV Raster frame detection and compare results."""
    size_tol_mm = float(profile.get("size_tolerance_mm", 1.5))
    aspect_tol = float(profile.get("aspect_tolerance", 0.003))

    trimbox_cand = _detect_from_trimbox(page, target_size_mm, size_tol_mm, aspect_tol)
    vector_cand = detect_frame_vector(page, target_size_mm, size_tol_mm, aspect_tol)
    raster_cand = detect_frame_raster(page, target_size_mm, size_tol_mm, aspect_tol)

    # Choose best candidate: TrimBox (if exact) -> Vector / Raster with higher confidence
    candidates = [
        c for c in (trimbox_cand, vector_cand, raster_cand) if c is not None
    ]
    if candidates:
        selected = max(
            candidates,
            key=lambda f: (f.confidence, -sum(f.size_err_mm)),
        )
    else:
        selected = Frame(
            bbox_mm=(0.0, 0.0, target_size_mm[0], target_size_mm[1]),
            method="manual",
            confidence=0.0,
            size_err_mm=(0.0, 0.0),
            confirmed=False,
            elapsed_ms=0.0,
        )

    return FrameDetectionReport(
        target_size_mm=target_size_mm,
        trimbox_candidate=trimbox_cand,
        vector_candidate=vector_cand,
        raster_candidate=raster_cand,
        selected=selected,
    )


def save_frame_preview(
    page: RasterPage,
    report: FrameDetectionReport,
    out_path: str | Path,
) -> Path:
    """Save debug preview image showing both pdf_vector (green) and opencv_raster (orange) frames."""
    canvas = page.img.copy()
    thickness = max(2, int(round(0.4 * page.px_per_mm)))
    font_scale = max(0.6, 0.08 * page.px_per_mm)

    if report.raster_candidate is not None:
        rx, ry, rw, rh = bbox_mm_to_px(report.raster_candidate.bbox_mm, page.px_per_mm)
        cv2.rectangle(
            canvas, (rx, ry), (rx + rw, ry + rh), (0, 140, 255), thickness + 2
        )
        label_r = (
            f"RASTER: {report.raster_candidate.bbox_mm[2]:.2f}x"
            f"{report.raster_candidate.bbox_mm[3]:.2f}mm "
            f"(conf={report.raster_candidate.confidence:.2f})"
        )
        cv2.putText(
            canvas,
            label_r,
            (max(10, rx + 10), max(30, ry + 35)),
            cv2.FONT_HERSHEY_SIMPLEX,
            font_scale,
            (0, 140, 255),
            max(2, thickness),
        )

    if report.vector_candidate is not None:
        vx, vy, vw, vh = bbox_mm_to_px(report.vector_candidate.bbox_mm, page.px_per_mm)
        cv2.rectangle(canvas, (vx, vy), (vx + vw, vy + vh), (0, 200, 0), thickness)
        label_v = (
            f"VECTOR: {report.vector_candidate.bbox_mm[2]:.2f}x"
            f"{report.vector_candidate.bbox_mm[3]:.2f}mm "
            f"(conf={report.vector_candidate.confidence:.2f})"
        )
        cv2.putText(
            canvas,
            label_v,
            (max(10, vx + 10), max(60, vy + 75)),
            cv2.FONT_HERSHEY_SIMPLEX,
            font_scale,
            (0, 200, 0),
            max(2, thickness),
        )

    path = Path(out_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(path), canvas)
    return path
