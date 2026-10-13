"""Unit tests for Task 1: artdiff.ingest.pdf_renderer."""

from __future__ import annotations

from pathlib import Path
import pymupdf as fitz
import numpy as np
import pytest

from artdiff.core.models import ArtDiffError
from artdiff.core.units import mm_to_pt
from artdiff.ingest.pdf_renderer import render_page

WORKSPACE = Path(__file__).resolve().parent.parent


def _create_synthetic_pdf(
    pdf_path: Path,
    page_w_mm: float = 700.0,
    page_h_mm: float = 320.0,
    frame_bbox_mm: tuple[float, float, float, float] = (40.0, 35.0, 620.0, 250.0),
    with_trimbox: bool = True,
) -> None:
    doc = fitz.open()
    page = doc.new_page(width=mm_to_pt(page_w_mm), height=mm_to_pt(page_h_mm))
    fx, fy, fw, fh = frame_bbox_mm
    rect_pt = fitz.Rect(
        mm_to_pt(fx),
        mm_to_pt(fy),
        mm_to_pt(fx + fw),
        mm_to_pt(fy + fh),
    )
    if with_trimbox:
        page.set_trimbox(rect_pt)
    page.draw_rect(rect_pt, color=(0.5, 0.0, 0.5), width=1.5)
    doc.save(str(pdf_path))
    doc.close()


def test_render_synthetic_page_dimensions_and_byte_equal(tmp_path: Path) -> None:
    pdf_path = tmp_path / "synthetic.pdf"
    _create_synthetic_pdf(pdf_path)

    px_per_mm = 4.0
    p1 = render_page(pdf_path, page_number=1, px_per_mm=px_per_mm, source="brand")
    p2 = render_page(pdf_path, page_number=1, px_per_mm=px_per_mm, source="brand")

    expected_w_px = round(p1.page_size_mm[0] * px_per_mm)
    expected_h_px = round(p1.page_size_mm[1] * px_per_mm)

    assert abs(p1.img.shape[1] - expected_w_px) <= 1
    assert abs(p1.img.shape[0] - expected_h_px) <= 1
    assert p1.img.dtype == np.uint8
    assert p1.img.shape[2] == 3
    assert np.array_equal(p1.img, p2.img)
    assert p1.trimbox_mm is not None
    assert p1.trimbox_mm == pytest.approx((40.0, 35.0, 620.0, 250.0), abs=0.1)
    assert len(p1.vector_candidates) >= 1


def test_render_page_out_of_range(tmp_path: Path) -> None:
    pdf_path = tmp_path / "single.pdf"
    _create_synthetic_pdf(pdf_path)

    with pytest.raises(ArtDiffError) as exc_info:
        render_page(pdf_path, page_number=2, px_per_mm=4.0, source="vendor")
    assert exc_info.value.code == "PAGE_OUT_OF_RANGE"

    with pytest.raises(ArtDiffError) as exc_info_zero:
        render_page(pdf_path, page_number=0, px_per_mm=4.0, source="vendor")
    assert exc_info_zero.value.code == "PAGE_OUT_OF_RANGE"


@pytest.mark.skipif(
    not (WORKSPACE / "brand.pdf").exists(),
    reason="Real sample brand.pdf not present",
)
def test_render_real_brand_and_vendor_page1() -> None:
    px_per_mm = 4.0
    brand_page = render_page(
        WORKSPACE / "brand.pdf", page_number=1, px_per_mm=px_per_mm, source="brand"
    )
    vendor_page = render_page(
        WORKSPACE / "vendor.pdf", page_number=1, px_per_mm=px_per_mm, source="vendor"
    )

    assert abs(brand_page.img.shape[1] - brand_page.page_size_mm[0] * px_per_mm) <= 1.0
    assert abs(brand_page.img.shape[0] - brand_page.page_size_mm[1] * px_per_mm) <= 1.0
    assert abs(vendor_page.img.shape[1] - vendor_page.page_size_mm[0] * px_per_mm) <= 1.0
    assert abs(vendor_page.img.shape[0] - vendor_page.page_size_mm[1] * px_per_mm) <= 1.0
