"""Unit tests for Task 6: artdiff.normalize.fit_meter."""

from __future__ import annotations

import math
from pathlib import Path
import cv2
import numpy as np
import pytest

from artdiff.core.models import AlignResult, Artboard, Frame
from artdiff.normalize.fit_meter import measure_fit, save_fit_visuals


def _make_textured_artboard(width: int = 800, height: int = 400) -> Artboard:
    rng = np.random.default_rng(123)
    img = np.full((height, width, 3), 235, dtype=np.uint8)
    for x in range(20, width - 20, 60):
        for y in range(20, height - 20, 50):
            color = tuple(int(c) for c in rng.integers(20, 180, size=3))
            cv2.rectangle(img, (x, y), (x + 35, y + 25), color, 2)
            cv2.circle(img, (x + 15, y + 12), 6, color, -1)
    frame = Frame(
        bbox_mm=(0.0, 0.0, 200.0, 100.0),
        method="pdf_vector",
        confidence=0.99,
        size_err_mm=(0.0, 0.0),
        confirmed=True,
    )
    return Artboard(
        img=img,
        px_per_mm=4.0,
        size_mm=(200.0, 100.0),
        frame=frame,
        source="brand",
        page_number=1,
        pdf_path="brand.pdf",
    )


def test_measure_fit_identical_images_pass(tmp_path: Path) -> None:
    """Spec Test 6.1: Identical image pair -> all cells ~ 0, PASS."""
    art_a = _make_textured_artboard()
    b_aligned = art_a.img.copy()
    valid_mask = np.full(art_a.img.shape[:2], 255, dtype=np.uint8)
    align_res = AlignResult(
        ok=True,
        transform=[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
        coarse_method="feature_ransac",
        fine_method="ecc_masked",
        inlier_count=100,
        inlier_rmse_px=0.0,
        stable_coverage_ratio=0.95,
        reason=None,
    )
    profile = {"align": {"grid": [10, 4], "max_grid_shift_px": 1.0, "max_inlier_rmse_px": 1.0}}

    report = measure_fit(art_a, b_aligned, valid_mask, align_res, 0.0, profile)
    assert report.passed is True
    assert report.grid_max_shift_px < 0.05
    assert len(report.flagged_cells) == 0

    files = save_fit_visuals(art_a, b_aligned, valid_mask, report, tmp_path)
    assert Path(files["overlay"]).is_file()
    assert Path(files["absdiff_heatmap"]).is_file()
    assert Path(files["grid_shift"]).is_file()


def test_measure_fit_unaligned_2px_shift_fails() -> None:
    """Spec Test 6.2: Pair shifted by 2 px without alignment -> FAIL, cells report ~ 2 px."""
    art_a = _make_textured_artboard()
    h, w = art_a.img.shape[:2]
    m_shift = np.array([[1.0, 0.0, 2.0], [0.0, 1.0, 0.0]], dtype=np.float32)
    b_shifted = cv2.warpAffine(
        art_a.img,
        m_shift,
        (w, h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(255, 255, 255),
    )
    valid_mask = np.full((h, w), 255, dtype=np.uint8)
    align_res = AlignResult(
        ok=True,
        transform=[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
        coarse_method="identity",
        fine_method=None,
        inlier_count=0,
        inlier_rmse_px=None,
        stable_coverage_ratio=1.0,
        reason=None,
    )
    profile = {"align": {"grid": [10, 4], "max_grid_shift_px": 1.0, "max_inlier_rmse_px": 1.0}}

    report = measure_fit(art_a, b_shifted, valid_mask, align_res, None, profile)
    assert report.passed is False
    assert report.grid_max_shift_px == pytest.approx(2.0, abs=0.25)
    assert len(report.flagged_cells) > 20
    for row in report.grid_shift_px:
        for val in row:
            if not math.isnan(val):
                assert val == pytest.approx(2.0, abs=0.3)


def test_save_fit_visuals_downscales_large_images(tmp_path: Path) -> None:
    """Ensure images larger than max_edge are downscaled proportionally."""
    # Create large image 4000x2000
    large_art = _make_textured_artboard(width=4000, height=2000)
    b_aligned = large_art.img.copy()
    valid_mask = np.full(large_art.img.shape[:2], 255, dtype=np.uint8)
    align_res = AlignResult(
        ok=True,
        transform=[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
        coarse_method="feature_ransac",
        fine_method="ecc_masked",
        inlier_count=100,
        inlier_rmse_px=0.0,
        stable_coverage_ratio=0.95,
        reason=None,
    )
    profile = {"align": {"grid": [10, 4], "max_grid_shift_px": 1.0, "max_inlier_rmse_px": 1.0}}
    report = measure_fit(large_art, b_aligned, valid_mask, align_res, 0.0, profile)

    files = save_fit_visuals(large_art, b_aligned, valid_mask, report, tmp_path, max_edge=2048)
    overlay_img = cv2.imread(files["overlay"])
    heatmap_img = cv2.imread(files["absdiff_heatmap"])

    assert overlay_img.shape[1] == 2048
    assert overlay_img.shape[0] == 1024  # 4000x2000 scaled to max edge 2048 -> 2048x1024
    assert heatmap_img.shape[1] == 2048
    assert heatmap_img.shape[0] == 1024

