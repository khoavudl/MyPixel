"""Task 1: Render PDF page at exact px/mm from vector and extract page metadata."""

from __future__ import annotations

from pathlib import Path
import sys
# Prevent optional pymupdf.layout ONNX crash in standalone builds
for _mod in ("pymupdf.layout", "pymupdf_layout", "pymupdf4llm"):
    sys.modules.setdefault(_mod, None)

import cv2
import pymupdf as fitz
import numpy as np

from artdiff.core.models import ArtDiffError, RasterPage, VectorRectCandidate
from artdiff.core.units import pt_to_mm, zoom_from_px_per_mm


def _rect_to_bbox_mm(
    rect: fitz.Rect,
    origin_x_pt: float,
    origin_y_pt: float,
) -> tuple[float, float, float, float]:
    """Convert a fitz.Rect in PDF points to (x, y, w, h) in mm relative to page origin."""
    return (
        pt_to_mm(rect.x0 - origin_x_pt),
        pt_to_mm(rect.y0 - origin_y_pt),
        pt_to_mm(rect.width),
        pt_to_mm(rect.height),
    )


def _extract_ocg_layers(doc: fitz.Document) -> list[str]:
    """Extract OCG (Optional Content Group / layer) names from the PDF document."""
    layers: list[str] = []
    try:
        ocgs = doc.get_ocgs()
        if isinstance(ocgs, dict):
            for info in ocgs.values():
                name = info.get("name")
                if name and name not in layers:
                    layers.append(str(name))
    except Exception:
        pass
    return layers


def _extract_vector_candidates(page: fitz.Page) -> list[VectorRectCandidate]:
    """Extract vector rectangles, path bounding boxes, and line-based rectangles from page."""
    origin_x = page.rect.x0
    origin_y = page.rect.y0
    candidates: list[VectorRectCandidate] = []

    horiz_lines: list[tuple[float, float, float]] = []  # (y_mm, x0_mm, x1_mm)
    vert_lines: list[tuple[float, float, float]] = []  # (x_mm, y0_mm, y1_mm)

    try:
        drawings = page.get_drawings()
    except Exception:
        drawings = []

    for d in drawings:
        stroke = tuple(d["color"]) if d.get("color") is not None else None
        fill = tuple(d["fill"]) if d.get("fill") is not None else None

        rect = d.get("rect")
        if rect is not None and not rect.is_empty and not rect.is_infinite:
            bbox_mm = _rect_to_bbox_mm(rect, origin_x, origin_y)
            if bbox_mm[2] >= 5.0 and bbox_mm[3] >= 5.0:
                candidates.append(
                    VectorRectCandidate(
                        bbox_mm=bbox_mm,
                        stroke_color=stroke,
                        fill_color=fill,
                        source_type="path_bbox",
                    )
                )

        for item in d.get("items", []):
            kind = item[0]
            if kind == "re":
                r = item[1]
                if not r.is_empty and not r.is_infinite:
                    bbox_mm = _rect_to_bbox_mm(r, origin_x, origin_y)
                    if bbox_mm[2] >= 5.0 and bbox_mm[3] >= 5.0:
                        candidates.append(
                            VectorRectCandidate(
                                bbox_mm=bbox_mm,
                                stroke_color=stroke,
                                fill_color=fill,
                                source_type="rect",
                            )
                        )
            elif kind == "l":
                p1, p2 = item[1], item[2]
                x0 = pt_to_mm(min(p1.x, p2.x) - origin_x)
                x1 = pt_to_mm(max(p1.x, p2.x) - origin_x)
                y0 = pt_to_mm(min(p1.y, p2.y) - origin_y)
                y1 = pt_to_mm(max(p1.y, p2.y) - origin_y)
                dx = x1 - x0
                dy = y1 - y0
                if dy <= 0.5 and dx >= 30.0:
                    horiz_lines.append((0.5 * (y0 + y1), x0, x1))
                elif dx <= 0.5 and dy >= 30.0:
                    vert_lines.append((0.5 * (x0 + x1), y0, y1))

    try:
        for img_info in page.get_image_info():
            bbox = img_info.get("bbox")
            if bbox is not None:
                r = fitz.Rect(bbox)
                if not r.is_empty and not r.is_infinite:
                    bbox_mm = _rect_to_bbox_mm(r, origin_x, origin_y)
                    if bbox_mm[2] >= 20.0 and bbox_mm[3] >= 20.0:
                        candidates.append(
                            VectorRectCandidate(
                                bbox_mm=bbox_mm,
                                stroke_color=None,
                                fill_color=None,
                                source_type="image_bbox",
                            )
                        )
    except Exception:
        pass

    # Cluster long horizontal and vertical lines to form synthetic line_group rectangles
    h_clusters = _cluster_lines(horiz_lines, pos_tol=1.0)
    v_clusters = _cluster_lines(vert_lines, pos_tol=1.0)

    if len(h_clusters) <= 40 and len(v_clusters) <= 40:
        for i in range(len(h_clusters)):
            y_top, hx0_t, hx1_t = h_clusters[i]
            for j in range(i + 1, len(h_clusters)):
                y_bot, hx0_b, hx1_b = h_clusters[j]
                h_mm = y_bot - y_top
                if h_mm < 20.0:
                    continue
                for k in range(len(v_clusters)):
                    x_left, vy0_l, vy1_l = v_clusters[k]
                    for m in range(k + 1, len(v_clusters)):
                        x_right, vy0_r, vy1_r = v_clusters[m]
                        w_mm = x_right - x_left
                        if w_mm < 20.0:
                            continue
                        # Check whether the 4 lines roughly span this rectangle
                        h_cov_top = max(0.0, min(hx1_t, x_right) - max(hx0_t, x_left)) / w_mm
                        h_cov_bot = max(0.0, min(hx1_b, x_right) - max(hx0_b, x_left)) / w_mm
                        v_cov_left = max(0.0, min(vy1_l, y_bot) - max(vy0_l, y_top)) / h_mm
                        v_cov_right = max(0.0, min(vy1_r, y_bot) - max(vy0_r, y_top)) / h_mm
                        if (
                            h_cov_top >= 0.7
                            and h_cov_bot >= 0.7
                            and v_cov_left >= 0.7
                            and v_cov_right >= 0.7
                        ):
                            candidates.append(
                                VectorRectCandidate(
                                    bbox_mm=(x_left, y_top, w_mm, h_mm),
                                    stroke_color=None,
                                    fill_color=None,
                                    source_type="line_group",
                                )
                            )

    return candidates


def _cluster_lines(
    lines: list[tuple[float, float, float]],
    pos_tol: float = 1.0,
) -> list[tuple[float, float, float]]:
    """Merge collinear horizontal or vertical segments within pos_tol mm."""
    if not lines:
        return []
    sorted_lines = sorted(lines, key=lambda item: item[0])
    clusters: list[list[tuple[float, float, float]]] = [[sorted_lines[0]]]
    for line in sorted_lines[1:]:
        if abs(line[0] - clusters[-1][-1][0]) <= pos_tol:
            clusters[-1].append(line)
        else:
            clusters.append([line])

    merged: list[tuple[float, float, float]] = []
    for group in clusters:
        pos = float(np.mean([g[0] for g in group]))
        start = min(g[1] for g in group)
        end = max(g[2] for g in group)
        merged.append((pos, start, end))
    return merged


def render_page(
    pdf_path: str | Path,
    page_number: int = 1,
    px_per_mm: float = 11.811,
    source: str = "brand",
) -> RasterPage:
    """Render a 1-based page from a PDF file to BGR uint8 at exact px_per_mm."""
    path = Path(pdf_path)
    if not path.is_file():
        raise ArtDiffError(
            code="PDF_NOT_FOUND",
            message=f"PDF file not found: {path}",
            exit_code=1,
        )

    if page_number < 1:
        raise ArtDiffError(
            code="PAGE_OUT_OF_RANGE",
            message=f"page_number is 1-based and must be >= 1, got {page_number}",
            exit_code=1,
        )

    doc = fitz.open(str(path))
    try:
        total_pages = len(doc)
        if page_number > total_pages:
            raise ArtDiffError(
                code="PAGE_OUT_OF_RANGE",
                message=(
                    f"Requested page {page_number} for '{source}' ({path.name}), "
                    f"but document only has {total_pages} page(s)."
                ),
                exit_code=1,
            )

        page_index = page_number - 1
        page = doc[page_index]

        page_rect = page.rect
        page_size_mm = (pt_to_mm(page_rect.width), pt_to_mm(page_rect.height))

        mediabox = page.mediabox
        trimbox = page.trimbox
        cropbox = page.cropbox

        trimbox_mm: tuple[float, float, float, float] | None = None
        if trimbox != mediabox and not trimbox.is_empty:
            trimbox_mm = _rect_to_bbox_mm(trimbox, page_rect.x0, page_rect.y0)

        cropbox_mm: tuple[float, float, float, float] | None = None
        if cropbox != mediabox and not cropbox.is_empty:
            cropbox_mm = _rect_to_bbox_mm(cropbox, page_rect.x0, page_rect.y0)

        ocg_layers = _extract_ocg_layers(doc)
        vector_candidates = _extract_vector_candidates(page)

        zoom = zoom_from_px_per_mm(px_per_mm)
        matrix = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=matrix, alpha=False)

        img_rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
            pix.height, pix.width, pix.n
        )
        img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)

        return RasterPage(
            img=img_bgr,
            px_per_mm=float(px_per_mm),
            page_size_mm=page_size_mm,
            trimbox_mm=trimbox_mm,
            cropbox_mm=cropbox_mm,
            ocg_layers=ocg_layers,
            vector_candidates=vector_candidates,
            source=source,
            page_number=page_number,
            pdf_path=str(path.resolve()),
        )
    finally:
        doc.close()
