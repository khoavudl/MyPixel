"""Unit tests for Task 3: artdiff.normalize.cropper."""

from __future__ import annotations

import numpy as np
import pytest

from artdiff.core.models import (
    ArtDiffError,
    Frame,
    FrameDetectionReport,
    RasterPage,
)
from artdiff.normalize.cropper import confirm_frame, crop


def _make_dummy_page() -> RasterPage:
    img = np.full((1200, 3000, 3), 255, dtype=np.uint8)
    return RasterPage(
        img=img,
        px_per_mm=4.0,
        page_size_mm=(750.0, 300.0),
        trimbox_mm=None,
        cropbox_mm=None,
        ocg_layers=[],
        vector_candidates=[],
        source="brand",
        page_number=1,
        pdf_path="dummy.pdf",
    )


def test_confirm_frame_auto_pass_and_crop() -> None:
    page = _make_dummy_page()
    frame = Frame(
        bbox_mm=(40.0, 25.0, 620.0, 250.0),
        method="pdf_vector",
        confidence=0.98,
        size_err_mm=(0.0, 0.0),
        confirmed=False,
    )
    report = FrameDetectionReport(
        target_size_mm=(620.0, 250.0),
        trimbox_candidate=None,
        vector_candidate=frame,
        raster_candidate=None,
        selected=frame,
    )

    confirmed = confirm_frame(report, "preview.png", mode="auto")
    assert confirmed.confirmed is True

    artboard = crop(page, confirmed)
    assert artboard.img.shape == (1000, 2480, 3)
    assert artboard.size_mm == (620.0, 250.0)


def test_confirm_frame_auto_low_confidence_raises() -> None:
    low_frame = Frame(
        bbox_mm=(0.0, 0.0, 620.0, 250.0),
        method="opencv_raster",
        confidence=0.65,
        size_err_mm=(3.0, 2.0),
        confirmed=False,
    )
    report = FrameDetectionReport(
        target_size_mm=(620.0, 250.0),
        trimbox_candidate=None,
        vector_candidate=None,
        raster_candidate=low_frame,
        selected=low_frame,
    )

    with pytest.raises(ArtDiffError) as exc_info:
        confirm_frame(report, "preview.png", mode="auto")
    assert exc_info.value.code == "FRAME_NOT_CONFIRMED"
    assert exc_info.value.exit_code == 4


def test_confirm_frame_interactive_manual_entry() -> None:
    manual_default = Frame(
        bbox_mm=(0.0, 0.0, 400.0, 200.0),
        method="manual",
        confidence=0.0,
        size_err_mm=(0.0, 0.0),
        confirmed=False,
    )
    report = FrameDetectionReport(
        target_size_mm=(400.0, 200.0),
        trimbox_candidate=None,
        vector_candidate=None,
        raster_candidate=None,
        selected=manual_default,
    )

    responses = iter(["e", "50, 30, 400, 200"])
    confirmed = confirm_frame(
        report,
        "preview.png",
        mode="interactive",
        input_fn=lambda _: next(responses),
    )
    assert confirmed.confirmed is True
    assert confirmed.method == "manual"
    assert confirmed.bbox_mm == (50.0, 30.0, 400.0, 200.0)
