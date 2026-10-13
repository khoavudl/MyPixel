"""Unit tests for artdiff.core.units."""

from __future__ import annotations

import math
import pytest

from artdiff.core.units import (
    bbox_mm_to_px,
    bbox_px_to_mm,
    mm_to_pt,
    mm_to_px,
    mm_to_px_int,
    pt_to_mm,
    px_per_mm_from_dpi,
    px_to_mm,
    zoom_from_px_per_mm,
)


def test_mm_pt_roundtrip() -> None:
    assert math.isclose(pt_to_mm(72.0), 25.4, rel_tol=1e-9)
    assert math.isclose(mm_to_pt(25.4), 72.0, rel_tol=1e-9)
    assert math.isclose(pt_to_mm(mm_to_pt(620.0)), 620.0, rel_tol=1e-9)


def test_mm_px_roundtrip() -> None:
    px_per_mm = px_per_mm_from_dpi(300.0)
    assert math.isclose(px_per_mm, 300.0 / 25.4, rel_tol=1e-9)
    px = mm_to_px(250.0, px_per_mm)
    assert math.isclose(px_to_mm(px, px_per_mm), 250.0, rel_tol=1e-9)
    assert mm_to_px_int(10.0, 10.0) == 100


def test_zoom_from_px_per_mm() -> None:
    px_per_mm = px_per_mm_from_dpi(300.0)
    zoom = zoom_from_px_per_mm(px_per_mm)
    assert math.isclose(zoom, 300.0 / 72.0, rel_tol=1e-9)


def test_bbox_conversions() -> None:
    bbox_mm = (10.0, 20.0, 620.0, 250.0)
    bbox_px = bbox_mm_to_px(bbox_mm, 10.0)
    assert bbox_px == (100, 200, 6200, 2500)
    back_mm = bbox_px_to_mm(bbox_px, 10.0)
    assert back_mm == pytest.approx(bbox_mm)


def test_invalid_inputs() -> None:
    with pytest.raises(ValueError):
        mm_to_px(10.0, 0.0)
    with pytest.raises(ValueError):
        px_to_mm(10.0, -1.0)
    with pytest.raises(ValueError):
        zoom_from_px_per_mm(0.0)
    with pytest.raises(ValueError):
        px_per_mm_from_dpi(-72.0)
