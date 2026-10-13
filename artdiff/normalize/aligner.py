"""Task 5: Bring Artboards to same coordinate system and align without relying on die-lines."""

from __future__ import annotations

from typing import Callable
import cv2
import numpy as np

from artdiff.core.models import AlignResult, Artboard, Frame


def _match_canvas_without_resize(img: np.ndarray, target_h: int, target_w: int) -> np.ndarray:
    """Pad with white or trim 1-2 rounding pixels to match target canvas shape without cv2.resize."""
    h, w = img.shape[:2]
    if h == target_h and w == target_w:
        return img
    canvas = np.full((target_h, target_w, 3), 255, dtype=np.uint8)
    copy_h = min(h, target_h)
    copy_w = min(w, target_w)
    canvas[:copy_h, :copy_w] = img[:copy_h, :copy_w]
    return canvas


def ensure_same_resolution(
    a: Artboard,
    b: Artboard,
    rerender_crop_fn: Callable[[str, int, float, Frame, str], Artboard] | None = None,
) -> Artboard:
    """Step 5a: Ensure B has the exact same pixel dimensions as A by re-rendering from PDF if needed."""
    target_h, target_w = a.img.shape[:2]
    cur_h, cur_w = b.img.shape[:2]

    # If pixel dimensions differ by more than 2 pixels and rerender callback is provided, re-render from PDF
    if (abs(cur_w - target_w) > 2 or abs(cur_h - target_h) > 2) and rerender_crop_fn is not None:
        adjusted_px_per_mm = float(target_w) / max(b.size_mm[0], 1e-6)
        b = rerender_crop_fn(
            b.pdf_path,
            b.page_number,
            adjusted_px_per_mm,
            b.frame,
            b.source,
        )

    if b.img.shape[:2] != (target_h, target_w):
        matched_img = _match_canvas_without_resize(b.img, target_h, target_w)
        b = Artboard(
            img=matched_img,
            px_per_mm=a.px_per_mm,
            size_mm=b.size_mm,
            frame=b.frame,
            source=b.source,
            page_number=b.page_number,
            pdf_path=b.pdf_path,
        )
    return b


def _detect_grid_corners(
    gray: np.ndarray,
    grid_cols: int = 8,
    grid_rows: int = 4,
    max_per_cell: int = 40,
) -> np.ndarray:
    """Detect sub-pixel Shi-Tomasi corners distributed uniformly across grid cells."""
    h, w = gray.shape[:2]
    cell_w = w // grid_cols
    cell_h = h // grid_rows
    margin = 8
    all_pts: list[np.ndarray] = []

    for r in range(grid_rows):
        for c in range(grid_cols):
            x0 = max(margin, c * cell_w)
            y0 = max(margin, r * cell_h)
            x1 = min(w - margin, (c + 1) * cell_w)
            y1 = min(h - margin, (r + 1) * cell_h)
            if x1 <= x0 + 10 or y1 <= y0 + 10:
                continue
            mask = np.zeros_like(gray)
            mask[y0:y1, x0:x1] = 255
            pts = cv2.goodFeaturesToTrack(
                gray,
                maxCorners=max_per_cell,
                qualityLevel=0.01,
                minDistance=7,
                mask=mask,
                blockSize=5,
            )
            if pts is not None and len(pts) > 0:
                all_pts.append(pts.reshape(-1, 2))

    if not all_pts:
        return np.empty((0, 2), dtype=np.float32)

    pts_arr = np.vstack(all_pts).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.005)
    refined = cv2.cornerSubPix(
        gray,
        pts_arr.reshape(-1, 1, 2),
        winSize=(5, 5),
        zeroZone=(-1, -1),
        criteria=criteria,
    )
    return refined.reshape(-1, 2)


def _coarse_feature_ransac(
    a_gray: np.ndarray,
    b_gray: np.ndarray,
    reproj_thresh: float = 2.0,
) -> tuple[np.ndarray | None, np.ndarray, np.ndarray]:
    """Estimate affine transform B -> A using sub-pixel optical flow + descriptor matches + RANSAC."""
    pts_a_list: list[np.ndarray] = []
    pts_b_list: list[np.ndarray] = []

    # 1. Sub-pixel pyramidal LK tracking with forward-backward consistency check
    corners_a = _detect_grid_corners(a_gray)
    if len(corners_a) >= 8:
        lk_params = dict(
            winSize=(21, 21),
            maxLevel=4,
            criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 40, 0.003),
        )
        p0 = corners_a.reshape(-1, 1, 2)
        p1, st_fwd, _ = cv2.calcOpticalFlowPyrLK(a_gray, b_gray, p0, None, **lk_params)
        p0_back, st_bwd, _ = cv2.calcOpticalFlowPyrLK(b_gray, a_gray, p1, None, **lk_params)

        if p1 is not None and p0_back is not None:
            fb_err = np.linalg.norm(p0.reshape(-1, 2) - p0_back.reshape(-1, 2), axis=1)
            valid = (
                (st_fwd.reshape(-1) == 1)
                & (st_bwd.reshape(-1) == 1)
                & (fb_err < 0.5)
            )
            ca = p0.reshape(-1, 2)[valid]
            cb = p1.reshape(-1, 2)[valid]

            # Filter by local patch intensity agreement so modified content blocks are rejected early
            h, w = a_gray.shape[:2]
            keep_a: list[np.ndarray] = []
            keep_b: list[np.ndarray] = []
            for pt_a, pt_b in zip(ca, cb):
                xa, ya = int(round(pt_a[0])), int(round(pt_a[1]))
                xb, yb = int(round(pt_b[0])), int(round(pt_b[1]))
                if 6 <= xa < w - 6 and 6 <= ya < h - 6 and 6 <= xb < w - 6 and 6 <= yb < h - 6:
                    patch_a = a_gray[ya - 5 : ya + 6, xa - 5 : xa + 6].astype(np.float32)
                    patch_b = b_gray[yb - 5 : yb + 6, xb - 5 : xb + 6].astype(np.float32)
                    if float(np.mean(np.abs(patch_a - patch_b))) < 25.0:
                        keep_a.append(pt_a)
                        keep_b.append(pt_b)

            if keep_a:
                pts_a_list.append(np.array(keep_a, dtype=np.float32))
                pts_b_list.append(np.array(keep_b, dtype=np.float32))

    # 2. Fallback / supplement with ORB keypoints if LK points are scarce
    if sum(len(x) for x in pts_a_list) < 20:
        orb = cv2.ORB_create(nfeatures=1500)
        kp_a, des_a = orb.detectAndCompute(a_gray, None)
        kp_b, des_b = orb.detectAndCompute(b_gray, None)
        if des_a is not None and des_b is not None and len(kp_a) >= 8 and len(kp_b) >= 8:
            matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
            knn = matcher.knnMatch(des_a, des_b, k=2)
            good_a = []
            good_b = []
            for pair in knn:
                if len(pair) == 2 and pair[0].distance < 0.75 * pair[1].distance:
                    good_a.append(kp_a[pair[0].queryIdx].pt)
                    good_b.append(kp_b[pair[0].trainIdx].pt)
            if len(good_a) >= 6:
                pts_a_list.append(np.array(good_a, dtype=np.float32))
                pts_b_list.append(np.array(good_b, dtype=np.float32))

    if not pts_a_list:
        return None, np.empty((0, 2), dtype=np.float32), np.empty((0, 2), dtype=np.float32)

    pts_a = np.vstack(pts_a_list)
    pts_b = np.vstack(pts_b_list)

    if len(pts_a) < 4:
        return None, np.empty((0, 2), dtype=np.float32), np.empty((0, 2), dtype=np.float32)

    # Estimate partial affine (translation + uniform scale + rotation) mapping B -> A
    matrix_b_to_a, inliers = cv2.estimateAffinePartial2D(
        pts_b,
        pts_a,
        method=cv2.RANSAC,
        ransacReprojThreshold=reproj_thresh,
        maxIters=3000,
        confidence=0.995,
    )
    if matrix_b_to_a is None or inliers is None:
        return None, np.empty((0, 2), dtype=np.float32), np.empty((0, 2), dtype=np.float32)

    inlier_mask = inliers.reshape(-1).astype(bool)
    in_a = pts_a[inlier_mask]
    in_b = pts_b[inlier_mask]

    # Least-squares refit on strict inliers (residual < 1.0 px) for maximum sub-pixel precision
    if len(in_a) >= 6:
        ones = np.ones((len(in_b), 1), dtype=np.float64)
        pred_a = (matrix_b_to_a @ np.hstack([in_b, ones]).T).T
        err = np.linalg.norm(in_a - pred_a, axis=1)
        tight = err < min(1.0, reproj_thresh)
        if int(np.sum(tight)) >= 6:
            in_a = in_a[tight]
            in_b = in_b[tight]
            refit, _ = cv2.estimateAffinePartial2D(
                in_b, in_a, method=cv2.LMEDS
            )
            if refit is not None:
                matrix_b_to_a = refit

    return matrix_b_to_a.astype(np.float64), in_a, in_b


def _compute_inlier_errors(
    matrix_b_to_a: np.ndarray,
    inliers_a: np.ndarray,
    inliers_b: np.ndarray,
) -> tuple[float | None, float | None]:
    """Return (rmse_px, max_err_px) for inlier correspondences under matrix_b_to_a."""
    if len(inliers_a) == 0:
        return None, None
    ones = np.ones((len(inliers_b), 1), dtype=np.float64)
    pts_b_h = np.hstack([inliers_b.astype(np.float64), ones])
    pred_a = (matrix_b_to_a @ pts_b_h.T).T
    errs = np.linalg.norm(inliers_a.astype(np.float64) - pred_a, axis=1)
    rmse = float(np.sqrt(np.mean(errs**2)))
    max_err = float(np.max(errs))
    return round(rmse, 4), round(max_err, 4)


def _invert_affine_2x3(m: np.ndarray) -> np.ndarray:
    """Invert a 2x3 affine matrix via 3x3 homogeneous inversion."""
    m3 = np.vstack([m, [0.0, 0.0, 1.0]])
    inv3 = np.linalg.inv(m3)
    return inv3[:2, :]


def _build_stable_mask(
    a_gray: np.ndarray,
    b_gray: np.ndarray,
    matrix_b_to_a: np.ndarray,
    diff_threshold: int = 25,
) -> np.ndarray:
    """Create stable_mask (uint8 0/255) excluding modified content regions and outer borders."""
    h, w = a_gray.shape[:2]
    b_coarse = cv2.warpAffine(
        b_gray,
        matrix_b_to_a,
        (w, h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=255,
    )
    a_blur = cv2.GaussianBlur(a_gray, (5, 5), 1.0)
    b_blur = cv2.GaussianBlur(b_coarse, (5, 5), 1.0)
    diff = cv2.absdiff(a_blur, b_blur)

    # Dilate changed regions so their edges do not bias ECC
    changed = (diff >= diff_threshold).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    changed_dilated = cv2.dilate(changed, kernel, iterations=1)

    stable = (changed_dilated == 0).astype(np.uint8) * 255
    margin = max(4, min(h, w) // 50)
    stable[:margin, :] = 0
    stable[h - margin :, :] = 0
    stable[:, :margin] = 0
    stable[:, w - margin :] = 0
    return stable


def align_artboards(
    a: Artboard,
    b: Artboard,
    profile: dict,
    rerender_crop_fn: Callable[[str, int, float, Frame, str], Artboard] | None = None,
) -> tuple[AlignResult, np.ndarray, np.ndarray, np.ndarray, float | None]:
    """Run Task 5 (5a same scale -> 5b coarse RANSAC -> 5c masked ECC -> 5d warp).

    Returns (AlignResult, b_aligned_bgr, valid_mask, stable_mask, inlier_max_err_px).
    """
    align_cfg = profile.get("align", {})
    min_inliers = int(align_cfg.get("min_ransac_inliers", 12))
    reproj_thresh = float(align_cfg.get("ransac_reproj_threshold_px", 2.0))
    diff_thresh = int(align_cfg.get("stable_diff_threshold", 25))
    ecc_max_iter = int(align_cfg.get("ecc_max_iter", 200))
    ecc_eps = float(align_cfg.get("ecc_eps", 1e-6))

    # 5a. Ensure B is rendered at the exact same pixel canvas size as A
    b_same = ensure_same_resolution(a, b, rerender_crop_fn=rerender_crop_fn)

    a_gray = cv2.cvtColor(a.img, cv2.COLOR_BGR2GRAY)
    b_gray = cv2.cvtColor(b_same.img, cv2.COLOR_BGR2GRAY)
    h, w = a_gray.shape[:2]

    # 5b. Coarse alignment via Feature + LK + RANSAC
    matrix_b_to_a, inliers_a, inliers_b = _coarse_feature_ransac(
        a_gray, b_gray, reproj_thresh=reproj_thresh
    )
    coarse_method = "feature_ransac"

    if matrix_b_to_a is None or len(inliers_a) < min_inliers:
        # Fallback to Phase Correlation (translation only)
        win = cv2.createHanningWindow((w, h), cv2.CV_32F)
        (dx, dy), _ = cv2.phaseCorrelate(
            b_gray.astype(np.float32), a_gray.astype(np.float32), window=win
        )
        matrix_b_to_a = np.array(
            [[1.0, 0.0, float(dx)], [0.0, 1.0, float(dy)]], dtype=np.float64
        )
        coarse_method = "phase_corr"

    coarse_rmse, coarse_max_err = _compute_inlier_errors(
        matrix_b_to_a, inliers_a, inliers_b
    )

    # 5c. Fine alignment via Masked ECC on stable (unmodified) regions
    stable_mask = _build_stable_mask(
        a_gray, b_gray, matrix_b_to_a, diff_threshold=diff_thresh
    )
    stable_ratio = round(float(np.mean(stable_mask > 0)), 4)

    fine_method: str | None = None
    reason: str | None = None
    final_matrix = matrix_b_to_a.copy()

    if stable_ratio >= 0.15:
        try:
            a_blur = cv2.GaussianBlur(a_gray, (0, 0), 1.0)
            b_blur = cv2.GaussianBlur(b_gray, (0, 0), 1.0)
            # In OpenCV, findTransformECC(template=a, input=b, warpMatrix=W_a_to_b)
            # relates to cv2.warpAffine(b, W_b_to_a) via W_b_to_a = inv(W_a_to_b)
            warp_a_to_b = _invert_affine_2x3(matrix_b_to_a).astype(np.float32)
            criteria = (
                cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT,
                ecc_max_iter,
                ecc_eps,
            )
            _, warp_a_to_b_refined = cv2.findTransformECC(
                a_blur,
                b_blur,
                warp_a_to_b,
                cv2.MOTION_AFFINE,
                criteria,
                inputMask=stable_mask,
                gaussFiltSize=5,
            )
            ecc_b_to_a = _invert_affine_2x3(warp_a_to_b_refined.astype(np.float64))
            ecc_rmse, _ = _compute_inlier_errors(ecc_b_to_a, inliers_a, inliers_b)

            # Accept ECC refinement if it improves or maintains tight sub-pixel inlier accuracy
            if coarse_rmse is None or (
                ecc_rmse is not None and ecc_rmse <= max(coarse_rmse + 0.05, 0.25)
            ):
                final_matrix = ecc_b_to_a
                fine_method = "ecc_masked"
            else:
                reason = (
                    f"ECC retained coarse RANSAC (coarse_rmse={coarse_rmse} px "
                    f"vs ecc_rmse={ecc_rmse} px)"
                )
        except cv2.error as exc:
            reason = f"ECC did not converge: {exc}"
    else:
        reason = f"Stable mask coverage too low for ECC ({stable_ratio:.2%})"

    final_rmse, final_max_err = _compute_inlier_errors(
        final_matrix, inliers_a, inliers_b
    )

    # 5d. Warp B into A's coordinate system + build valid_mask
    b_aligned = cv2.warpAffine(
        b_same.img,
        final_matrix,
        (w, h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(255, 255, 255),
    )

    full_mask = np.full((h, w), 255, dtype=np.uint8)
    valid_mask = cv2.warpAffine(
        full_mask,
        final_matrix,
        (w, h),
        flags=cv2.INTER_NEAREST,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    )
    erode_k = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    valid_mask = cv2.erode(valid_mask, erode_k, iterations=1)

    result = AlignResult(
        ok=True,
        transform=[[round(float(v), 8) for v in row] for row in final_matrix],
        coarse_method=coarse_method,
        fine_method=fine_method,
        inlier_count=int(len(inliers_a)),
        inlier_rmse_px=final_rmse,
        stable_coverage_ratio=stable_ratio,
        reason=reason,
    )
    return result, b_aligned, valid_mask, stable_mask, final_max_err
