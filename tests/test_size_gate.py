"""Unit tests for Task 4: artdiff.normalize.size_gate."""

from __future__ import annotations

import numpy as np
import pytest

from artdiff.core.models import Artboard, Frame
from artdiff.normalize.size_gate import check_size


def _make_artboard(w_mm: float, h_mm: float, source: str = "brand") -> Artboard:
    frame = Frame(
        bbox_mm=(0.0, 0.0, w_mm, h_mm),
        method="pdf_vector",
        confidence=0.99,
        size_err_mm=(0.0, 0.0),
        confirmed=True,
    )
    img = np.zeros((int(round(h_mm * 2)), int(round(w_mm * 2)), 3), dtype=np.uint8)
    return Artboard(
        img=img,
        px_per_mm=2.0,
        size_mm=(w_mm, h_mm),
        frame=frame,
        source=source,
        page_number=1,
        pdf_path=f"{source}.pdf",
    )


def test_size_gate_pass() -> None:
    profile = {"size_tolerance_mm": 1.0, "aspect_tolerance": 0.002}
    a = _make_artboard(620.0, 250.0, "brand")
    b = _make_artboard(620.2, 249.9, "vendor")
    res = check_size(a, b, target_size_mm=(620.0, 250.0), profile=profile)
    assert res.passed is True
    assert res.status == "PASS"


def test_size_gate_scaled_file() -> None:
    profile = {"size_tolerance_mm": 1.0, "aspect_tolerance": 0.002}
    a = _make_artboard(620.0, 250.0, "brand")
    b = _make_artboard(310.0, 125.0, "vendor")  # 50% scale, identical aspect ratio
    res = check_size(a, b, target_size_mm=(620.0, 250.0), profile=profile)
    assert res.passed is True
    assert res.status == "SCALED_FILE"
    assert res.scale_factor_b_to_a == pytest.approx((2.0, 2.0))


def test_size_gate_aspect_mismatch() -> None:
    profile = {"size_tolerance_mm": 1.0, "aspect_tolerance": 0.002}
    a = _make_artboard(620.0, 250.0, "brand")
    b = _make_artboard(580.0, 270.0, "vendor")
    res = check_size(a, b, target_size_mm=(620.0, 250.0), profile=profile)
    assert res.passed is False
    assert res.status == "ASPECT_MISMATCH"


def test_size_gate_size_mismatch_single_dimension() -> None:
    profile = {"size_tolerance_mm": 1.0, "aspect_tolerance": 0.002}
    a = _make_artboard(620.0, 250.0, "brand")
    b = _make_artboard(620.0, 260.0, "vendor")  # Width matches, height off by 10 mm
    res = check_size(a, b, target_size_mm=(620.0, 250.0), profile=profile)
    assert res.passed is False
    assert res.status == "SIZE_MISMATCH"
