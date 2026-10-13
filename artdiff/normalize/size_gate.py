"""Task 4: Size and aspect ratio gate comparing Artboard A, Artboard B, and target WxH."""

from __future__ import annotations

from artdiff.core.models import Artboard, GateResult


def check_size(
    a: Artboard,
    b: Artboard,
    target_size_mm: tuple[float, float],
    profile: dict,
) -> GateResult:
    """Validate aspect ratio and physical dimensions (mm) of Artboards A and B."""
    size_tol_mm = float(profile.get("size_tolerance_mm", 1.5))
    aspect_tol = float(profile.get("aspect_tolerance", 0.003))

    w_a, h_a = a.size_mm
    w_b, h_b = b.size_mm
    target_w, target_h = target_size_mm

    aspect_a = w_a / max(h_a, 1e-6)
    aspect_b = w_b / max(h_b, 1e-6)
    aspect_t = target_w / max(target_h, 1e-6)

    rel_err_ab = abs(aspect_a - aspect_b) / aspect_t
    rel_err_at = abs(aspect_a - aspect_t) / aspect_t
    rel_err_bt = abs(aspect_b - aspect_t) / aspect_t
    aspect_diff = round(max(rel_err_ab, rel_err_at, rel_err_bt), 6)

    diff_a = (round(abs(w_a - target_w), 4), round(abs(h_a - target_h), 4))
    diff_b = (round(abs(w_b - target_w), 4), round(abs(h_b - target_h), 4))
    scale_b_to_a = (round(w_a / max(w_b, 1e-6), 6), round(h_a / max(h_b, 1e-6), 6))

    a_fits_size = diff_a[0] <= size_tol_mm and diff_a[1] <= size_tol_mm
    b_fits_size = diff_b[0] <= size_tol_mm and diff_b[1] <= size_tol_mm

    # 1. Check aspect ratio mismatch first (unless both are within size_tolerance_mm)
    if aspect_diff > aspect_tol and not (a_fits_size and b_fits_size):
        # Distinguish whether one side has a single dimension wrong vs general aspect mismatch
        if (diff_a[0] <= size_tol_mm) ^ (diff_a[1] <= size_tol_mm) or (
            (diff_b[0] <= size_tol_mm) ^ (diff_b[1] <= size_tol_mm)
        ):
            return GateResult(
                status="SIZE_MISMATCH",
                passed=False,
                scale_factor_b_to_a=scale_b_to_a,
                aspect_diff=aspect_diff,
                size_diff_mm_a=diff_a,
                size_diff_mm_b=diff_b,
                reason=(
                    f"SIZE_MISMATCH: target=({target_w:.2f}x{target_h:.2f}) mm, "
                    f"brand=({w_a:.2f}x{h_a:.2f}) mm [diff={diff_a}], "
                    f"vendor=({w_b:.2f}x{h_b:.2f}) mm [diff={diff_b}]."
                ),
            )
        return GateResult(
            status="ASPECT_MISMATCH",
            passed=False,
            scale_factor_b_to_a=scale_b_to_a,
            aspect_diff=aspect_diff,
            size_diff_mm_a=diff_a,
            size_diff_mm_b=diff_b,
            reason=(
                f"ASPECT_MISMATCH: relative aspect diff {aspect_diff:.5f} > {aspect_tol:.5f} "
                f"(brand={w_a:.2f}x{h_a:.2f} mm, vendor={w_b:.2f}x{h_b:.2f} mm, "
                f"target={target_w:.2f}x{target_h:.2f} mm)."
            ),
        )

    # 2. Both match target size within tolerance -> PASS
    if a_fits_size and b_fits_size:
        return GateResult(
            status="PASS",
            passed=True,
            scale_factor_b_to_a=scale_b_to_a,
            aspect_diff=aspect_diff,
            size_diff_mm_a=diff_a,
            size_diff_mm_b=diff_b,
            reason=None,
        )

    # 3. Aspect ratio matches within aspect_tolerance, but absolute size differs -> SCALED_FILE
    if aspect_diff <= aspect_tol:
        return GateResult(
            status="SCALED_FILE",
            passed=True,
            scale_factor_b_to_a=scale_b_to_a,
            aspect_diff=aspect_diff,
            size_diff_mm_a=diff_a,
            size_diff_mm_b=diff_b,
            reason=(
                f"SCALED_FILE: aspect ratio matches, but size differs from target "
                f"{target_w:.2f}x{target_h:.2f} mm "
                f"(brand={w_a:.2f}x{h_a:.2f} mm, vendor={w_b:.2f}x{h_b:.2f} mm, "
                f"scale_b_to_a={scale_b_to_a})."
            ),
        )

    return GateResult(
        status="SIZE_MISMATCH",
        passed=False,
        scale_factor_b_to_a=scale_b_to_a,
        aspect_diff=aspect_diff,
        size_diff_mm_a=diff_a,
        size_diff_mm_b=diff_b,
        reason=(
            f"SIZE_MISMATCH: brand=({w_a:.2f}x{h_a:.2f}) mm, "
            f"vendor=({w_b:.2f}x{h_b:.2f}) mm vs target=({target_w:.2f}x{target_h:.2f}) mm."
        ),
    )
