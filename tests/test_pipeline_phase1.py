"""Unit and integration tests for Task 7: artdiff.pipeline_phase1."""

from __future__ import annotations

import json
from pathlib import Path
import pymupdf as fitz

from artdiff.core.units import mm_to_pt
from artdiff.pipeline_phase1 import parse_size_mm, run_phase1


def _make_sample_pdf(
    pdf_path: Path,
    page_w_mm: float = 500.0,
    page_h_mm: float = 250.0,
    art_bbox_mm: tuple[float, float, float, float] = (40.0, 25.0, 400.0, 180.0),
    page_number_target: int = 1,
    total_pages: int = 1,
) -> None:
    doc = fitz.open()
    for p_idx in range(total_pages):
        page = doc.new_page(width=mm_to_pt(page_w_mm), height=mm_to_pt(page_h_mm))
        if (p_idx + 1) == page_number_target:
            ax, ay, aw, ah = art_bbox_mm
            rect = fitz.Rect(
                mm_to_pt(ax), mm_to_pt(ay), mm_to_pt(ax + aw), mm_to_pt(ay + ah)
            )
            page.draw_rect(rect, color=(0.1, 0.1, 0.1), fill=(0.85, 0.9, 0.95), width=1.5)
            # Draw rich grid inside artwork so alignment has plenty of features
            for gx in range(int(ax + 15), int(ax + aw - 25), 35):
                for gy in range(int(ay + 15), int(ay + ah - 25), 30):
                    sub = fitz.Rect(
                        mm_to_pt(gx),
                        mm_to_pt(gy),
                        mm_to_pt(gx + 18),
                        mm_to_pt(gy + 14),
                    )
                    page.draw_rect(sub, color=(0.2, 0.3, 0.7), fill=(0.4, 0.6, 0.2), width=0.8)
    doc.save(str(pdf_path))
    doc.close()


def test_parse_size_mm() -> None:
    assert parse_size_mm("620x250") == (620.0, 250.0)
    assert parse_size_mm("400, 180") == (400.0, 180.0)


def test_pipeline_multipage_supplier_and_custom_size(tmp_path: Path) -> None:
    """Verify pipeline when supplier artwork is on page 3 of a 4-page PDF and size is 400x180."""
    brand_pdf = tmp_path / "brand_custom.pdf"
    vendor_pdf = tmp_path / "vendor_4pages.pdf"

    _make_sample_pdf(
        brand_pdf,
        page_w_mm=480.0,
        page_h_mm=230.0,
        art_bbox_mm=(30.0, 20.0, 400.0, 180.0),
        page_number_target=1,
        total_pages=1,
    )
    _make_sample_pdf(
        vendor_pdf,
        page_w_mm=520.0,
        page_h_mm=260.0,
        art_bbox_mm=(50.0, 35.0, 400.0, 180.0),
        page_number_target=3,
        total_pages=4,
    )

    # Use a fast test profile (px_per_mm = 3.0)
    prof_path = tmp_path / "fast_profile.yaml"
    prof_path.write_text("px_per_mm: 3.0\nsize_tolerance_mm: 1.5\naspect_tolerance: 0.003\n")

    exit_code, report, run_dir = run_phase1(
        brand_pdf=brand_pdf,
        vendor_pdf=vendor_pdf,
        target_size_mm=(400.0, 180.0),
        brand_page=1,
        vendor_page=3,
        profile_path=prof_path,
        mode="auto",
        out_root=tmp_path / "out",
        run_id="test_multipage",
    )

    assert exit_code == 0
    assert report["status"] == "PASS"
    assert (run_dir / "report.json").is_file()
    assert (run_dir / "overlay.png").is_file()
    assert (run_dir / "absdiff_heatmap.png").is_file()
    assert (run_dir / "grid_shift.png").is_file()

    saved = json.loads((run_dir / "report.json").read_text(encoding="utf-8"))
    assert saved["inputs"]["vendor"]["page_number"] == 3
    assert saved["tasks"]["task6_fit_meter"]["passed"] is True
