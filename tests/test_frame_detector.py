"""Unit tests for Task 2: artdiff.normalize.frame_detector."""

from __future__ import annotations

from pathlib import Path
import pymupdf as fitz
import pytest

from artdiff.core.units import mm_to_pt
from artdiff.ingest.pdf_renderer import render_page
from artdiff.normalize.frame_detector import detect_frame, save_frame_preview

WORKSPACE = Path(__file__).resolve().parent.parent


def _make_synthetic_artwork_pdf(
    pdf_path: Path,
    page_size_mm: tuple[float, float],
    art_bbox_mm: tuple[float, float, float, float] | None,
) -> None:
    doc = fitz.open()
    pw, ph = page_size_mm
    page = doc.new_page(width=mm_to_pt(pw), height=mm_to_pt(ph))

    if art_bbox_mm is not None:
        ax, ay, aw, ah = art_bbox_mm
        art_rect = fitz.Rect(
            mm_to_pt(ax),
            mm_to_pt(ay),
            mm_to_pt(ax + aw),
            mm_to_pt(ay + ah),
        )
        # Draw filled artwork background + border
        page.draw_rect(art_rect, color=(0.1, 0.1, 0.1), fill=(0.2, 0.35, 0.65), width=1.2)
        # Add fake approval block and color swatches below the artwork
        block_y = ay + ah + 8.0
        if block_y + 22.0 < ph:
            block_rect = fitz.Rect(
                mm_to_pt(ax),
                mm_to_pt(block_y),
                mm_to_pt(ax + min(220.0, aw * 0.6)),
                mm_to_pt(block_y + 20.0),
            )
            page.draw_rect(block_rect, color=(0, 0, 0), fill=(0.9, 0.9, 0.9), width=0.8)
            for idx in range(5):
                sx = ax + 10.0 + idx * 15.0
                s_rect = fitz.Rect(
                    mm_to_pt(sx),
                    mm_to_pt(block_y + 4.0),
                    mm_to_pt(sx + 10.0),
                    mm_to_pt(block_y + 14.0),
                )
                page.draw_rect(s_rect, color=(0, 0, 0), fill=(0.8, 0.1 * idx, 0.3), width=0.5)

    doc.save(str(pdf_path))
    doc.close()


def test_detect_frame_custom_size_with_distractors(tmp_path: Path) -> None:
    """Test non-620x250 custom design size (420 x 180 mm) with approval block below."""
    pdf_path = tmp_path / "custom_420x180.pdf"
    expected_bbox = (35.0, 25.0, 420.0, 180.0)
    _make_synthetic_artwork_pdf(
        pdf_path,
        page_size_mm=(500.0, 260.0),
        art_bbox_mm=expected_bbox,
    )

    page = render_page(pdf_path, page_number=1, px_per_mm=5.0, source="vendor")
    profile = {"size_tolerance_mm": 1.5, "aspect_tolerance": 0.003}
    report = detect_frame(page, target_size_mm=(420.0, 180.0), profile=profile)

    assert report.vector_candidate is not None
    assert report.raster_candidate is not None

    for cand in (report.vector_candidate, report.raster_candidate, report.selected):
        assert cand.bbox_mm == pytest.approx(expected_bbox, abs=0.5)
        assert cand.confidence >= 0.9

    preview_path = save_frame_preview(page, report, tmp_path / "frame_preview.png")
    assert preview_path.is_file()


def test_detect_frame_blank_page_returns_manual(tmp_path: Path) -> None:
    pdf_path = tmp_path / "blank.pdf"
    _make_synthetic_artwork_pdf(
        pdf_path,
        page_size_mm=(500.0, 260.0),
        art_bbox_mm=None,
    )

    page = render_page(pdf_path, page_number=1, px_per_mm=4.0, source="brand")
    profile = {"size_tolerance_mm": 1.5, "aspect_tolerance": 0.003}
    report = detect_frame(page, target_size_mm=(420.0, 180.0), profile=profile)

    assert report.vector_candidate is None
    assert report.raster_candidate is None
    assert report.selected.method == "manual"
    assert report.selected.confidence == 0.0
    assert report.selected.confirmed is False


@pytest.mark.skipif(
    not (WORKSPACE / "brand.pdf").exists(),
    reason="Real sample PDFs not present",
)
def test_detect_frame_real_brand_and_vendor_page1() -> None:
    profile = {"size_tolerance_mm": 1.5, "aspect_tolerance": 0.003}
    for name in ("brand.pdf", "vendor.pdf"):
        page = render_page(WORKSPACE / name, page_number=1, px_per_mm=5.0, source=name)
        report = detect_frame(page, target_size_mm=(620.0, 250.0), profile=profile)
        assert report.vector_candidate is not None
        assert report.raster_candidate is not None
        assert report.vector_candidate.size_err_mm[0] <= 0.5
        assert report.vector_candidate.size_err_mm[1] <= 0.5
        assert report.raster_candidate.size_err_mm[0] <= 0.5
        assert report.raster_candidate.size_err_mm[1] <= 0.5
        assert report.selected.confidence >= 0.95
