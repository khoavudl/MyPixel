"""Unit tests for Task 5: artdiff.normalize.aligner."""

from __future__ import annotations

import math
import cv2
import numpy as np

from artdiff.core.models import Artboard, Frame
from artdiff.normalize.aligner import align_artboards


def _create_rich_artwork_image(width: int = 800, height: int = 400) -> np.ndarray:
    """Generate a textured synthetic packaging artwork image with text, boxes, and patterns."""
    rng = np.random.default_rng(42)
    img = np.full((height, width, 3), 240, dtype=np.uint8)

    # Draw structured grid panels, circles, and text across the canvas
    for x in range(40, width - 40, 80):
        for y in range(40, height - 40, 70):
            color = tuple(int(c) for c in rng.integers(30, 200, size=3))
            cv2.rectangle(img, (x, y), (x + 50, y + 40), color, 2)
            cv2.circle(img, (x + 25, y + 20), 10, color, -1)
            cv2.putText(
                img,
                f"{x//10}",
                (x + 5, y + 35),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (20, 20, 20),
                1,
            )
    return img


def _make_artboard_from_img(img: np.ndarray, source: str = "brand") -> Artboard:
    h, w = img.shape[:2]
    frame = Frame(
        bbox_mm=(0.0, 0.0, w / 4.0, h / 4.0),
        method="pdf_vector",
        confidence=0.99,
        size_err_mm=(0.0, 0.0),
        confirmed=True,
    )
    return Artboard(
        img=img,
        px_per_mm=4.0,
        size_mm=(w / 4.0, h / 4.0),
        frame=frame,
        source=source,
        page_number=1,
        pdf_path=f"{source}.pdf",
    )


def _warp_ground_truth_a_to_b(
    img_a: np.ndarray,
    dx: float = 3.4,
    dy: float = -2.1,
    scale: float = 1.003,
    angle_deg: float = 0.1,
) -> tuple[np.ndarray, np.ndarray]:
    """Create B by applying known shift, scale, and rotation to A."""
    h, w = img_a.shape[:2]
    center = (w * 0.5, h * 0.5)
    m_a_to_b = cv2.getRotationMatrix2D(center, angle_deg, scale)
    m_a_to_b[0, 2] += dx
    m_a_to_b[1, 2] += dy
    img_b = cv2.warpAffine(
        img_a,
        m_a_to_b,
        (w, h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(255, 255, 255),
    )
    return img_b, m_a_to_b


def test_align_subpixel_shift_scale_rotation() -> None:
    """Spec Test 5.1: shift (3.4, -2.1) px + scale 1.003 + rotate 0.1 deg -> error < 0.5 px."""
    img_a = _create_rich_artwork_image(800, 400)
    img_b, m_a_to_b = _warp_ground_truth_a_to_b(
        img_a, dx=3.4, dy=-2.1, scale=1.003, angle_deg=0.1
    )

    art_a = _make_artboard_from_img(img_a, "brand")
    art_b = _make_artboard_from_img(img_b, "vendor")
    profile = {"align": {"min_ransac_inliers": 12, "ransac_reproj_threshold_px": 2.0}}

    res, _, _, _, max_err = align_artboards(art_a, art_b, profile=profile)
    assert res.ok is True
    assert res.inlier_rmse_px is not None
    assert res.inlier_rmse_px < 0.5
    assert max_err is not None and max_err < 0.5

    # Verify recovered transform against true inverse (B -> A) on interior check points
    m_est = np.array(res.transform, dtype=np.float64)
    check_pts_a = np.array(
        [[150.0, 100.0], [650.0, 100.0], [150.0, 300.0], [650.0, 300.0], [400.0, 200.0]]
    )
    ones = np.ones((len(check_pts_a), 1))
    pts_b = (m_a_to_b @ np.hstack([check_pts_a, ones]).T).T
    pts_a_recovered = (m_est @ np.hstack([pts_b, ones]).T).T
    point_errs = np.linalg.norm(check_pts_a - pts_a_recovered, axis=1)
    assert float(np.max(point_errs)) < 0.5


def test_align_robust_to_large_modified_content_region() -> None:
    """Spec Test 5.2: Adding a large modified region in B does not pull alignment off."""
    img_a = _create_rich_artwork_image(800, 400)
    img_b_clean, _ = _warp_ground_truth_a_to_b(
        img_a, dx=3.4, dy=-2.1, scale=1.003, angle_deg=0.1
    )
    img_b_modified = img_b_clean.copy()
    # Overwrite a large 220x150 region in B with completely different color and text
    cv2.rectangle(img_b_modified, (250, 120), (470, 270), (10, 220, 250), -1)
    cv2.putText(
        img_b_modified,
        "MODIFIED CONTENT",
        (265, 200),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 0, 200),
        2,
    )

    profile = {"align": {"min_ransac_inliers": 12, "ransac_reproj_threshold_px": 2.0}}
    res_clean, _, _, _, _ = align_artboards(
        _make_artboard_from_img(img_a, "brand"),
        _make_artboard_from_img(img_b_clean, "vendor"),
        profile=profile,
    )
    res_mod, _, _, _, _ = align_artboards(
        _make_artboard_from_img(img_a, "brand"),
        _make_artboard_from_img(img_b_modified, "vendor"),
        profile=profile,
    )

    m_clean = np.array(res_clean.transform, dtype=np.float64)
    m_mod = np.array(res_mod.transform, dtype=np.float64)

    # Compare transformed corner positions between clean and modified alignment
    test_pts = np.array([[100.0, 80.0, 1.0], [700.0, 80.0, 1.0], [700.0, 320.0, 1.0], [100.0, 320.0, 1.0]])
    diff_pts = np.linalg.norm((m_clean @ test_pts.T).T - (m_mod @ test_pts.T).T, axis=1)
    assert float(np.max(diff_pts)) < 0.25
