"""Task 7: Phase 1 Orchestrator and CLI."""

from __future__ import annotations

import argparse
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
import time
from typing import Any, Callable
import cv2
import yaml

from artdiff.core.models import ArtDiffError, Artboard, Frame, FrameDetectionReport
from artdiff.ingest.pdf_renderer import render_page
from artdiff.normalize.aligner import align_artboards
from artdiff.normalize.cropper import confirm_frame, crop
from artdiff.normalize.fit_meter import measure_fit, save_fit_visuals
from artdiff.normalize.frame_detector import detect_frame, save_frame_preview
from artdiff.normalize.size_gate import check_size

PACKAGE_DIR = Path(__file__).resolve().parent


def _sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _sanitize_for_json(obj: Any) -> Any:
    """Convert NaN/Inf floats to None for strict JSON compliance."""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_for_json(v) for v in obj]
    return obj


def load_profile(profile_path: str | Path | None = None) -> dict[str, Any]:
    """Load YAML profile, resolving relative to workspace or artdiff package."""
    candidates: list[Path] = []
    if profile_path is not None:
        p = Path(profile_path)
        candidates.append(p)
        candidates.append(PACKAGE_DIR / p)
    candidates.append(PACKAGE_DIR / "profiles" / "default.yaml")

    for cand in candidates:
        if cand.is_file():
            with open(cand, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
            return data

    raise ArtDiffError(
        code="PROFILE_NOT_FOUND",
        message=f"Could not find profile at {profile_path}",
        exit_code=1,
    )


def parse_size_mm(size_str: str) -> tuple[float, float]:
    """Parse '620x250' or '620,250' into (620.0, 250.0)."""
    cleaned = size_str.strip().lower().replace("mm", "").replace(",", "x")
    parts = [p.strip() for p in cleaned.split("x") if p.strip()]
    if len(parts) != 2:
        raise ArtDiffError(
            code="INVALID_TARGET_SIZE",
            message=f"Expected target size format WxH (e.g. 620x250), got '{size_str}'",
            exit_code=1,
        )
    try:
        w = float(parts[0])
        h = float(parts[1])
    except ValueError as exc:
        raise ArtDiffError(
            code="INVALID_TARGET_SIZE",
            message=f"Invalid numeric size '{size_str}': {exc}",
            exit_code=1,
        ) from exc
    if w <= 0 or h <= 0:
        raise ArtDiffError(
            code="INVALID_TARGET_SIZE",
            message=f"Target size must be positive, got ({w}, {h})",
            exit_code=1,
        )
    return (w, h)


def _rerender_and_crop(
    pdf_path: str,
    page_number: int,
    px_per_mm: float,
    frame: Frame,
    source: str,
) -> Artboard:
    page = render_page(pdf_path, page_number=page_number, px_per_mm=px_per_mm, source=source)
    return crop(page, frame)


def run_phase1(
    brand_pdf: str | Path,
    vendor_pdf: str | Path,
    target_size_mm: tuple[float, float] | None = None,
    brand_page: int = 1,
    vendor_page: int = 1,
    profile_path: str | Path | None = None,
    mode: str = "auto",
    out_root: str | Path = "out",
    run_id: str | None = None,
    input_fn: Callable[[str], str] = input,
    on_progress: Callable[[dict[str, Any]], None] | None = None,
) -> tuple[int, dict[str, Any], Path]:
    """Execute the complete Phase 1 pipeline and write report.json + diagnostic images."""
    if run_id is None:
        run_id = datetime.now(timezone.utc).strftime("run_%Y%m%d_%H%M%S_%f")
    run_dir = Path(out_root) / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    def _notify(
        msg_type: str,
        task: str | None,
        status: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        if on_progress is not None:
            try:
                on_progress(
                    {
                        "type": msg_type,
                        "task": task,
                        "status": status,
                        "message": message,
                        "timestamp": time.time(),
                        "details": details,
                    }
                )
            except Exception:
                pass

    report: dict[str, Any] = {
        "run_id": run_id,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "target_size_mm": list(target_size_mm) if target_size_mm else None,
        "inputs": {
            "brand": {"pdf_path": str(brand_pdf), "page_number": brand_page},
            "vendor": {"pdf_path": str(vendor_pdf), "page_number": vendor_page},
        },
        "tasks": {},
        "status": "INIT",
        "exit_code": 1,
    }

    try:
        profile = load_profile(profile_path)
        report["profile"] = profile
        px_per_mm = float(profile.get("px_per_mm", 11.811))

        # --- Task 1: Render PDF pages ---
        _notify("step_start", "task1_render", "IN_PROGRESS", "Rendering Brand and Vendor PDF pages...")
        t0 = time.perf_counter()
        brand_raster = render_page(
            brand_pdf, page_number=brand_page, px_per_mm=px_per_mm, source="brand"
        )
        vendor_raster = render_page(
            vendor_pdf, page_number=vendor_page, px_per_mm=px_per_mm, source="vendor"
        )
        t1_ms = round((time.perf_counter() - t0) * 1000.0, 2)

        report["inputs"]["brand"].update(
            {
                "sha256": _sha256_file(brand_pdf),
                "page_size_mm": [round(v, 4) for v in brand_raster.page_size_mm],
                "rendered_shape_px": list(brand_raster.img.shape),
                "trimbox_mm": list(brand_raster.trimbox_mm) if brand_raster.trimbox_mm else None,
                "cropbox_mm": list(brand_raster.cropbox_mm) if brand_raster.cropbox_mm else None,
                "ocg_layers": brand_raster.ocg_layers,
                "vector_candidates_count": len(brand_raster.vector_candidates),
            }
        )
        report["inputs"]["vendor"].update(
            {
                "sha256": _sha256_file(vendor_pdf),
                "page_size_mm": [round(v, 4) for v in vendor_raster.page_size_mm],
                "rendered_shape_px": list(vendor_raster.img.shape),
                "trimbox_mm": list(vendor_raster.trimbox_mm) if vendor_raster.trimbox_mm else None,
                "cropbox_mm": list(vendor_raster.cropbox_mm) if vendor_raster.cropbox_mm else None,
                "ocg_layers": vendor_raster.ocg_layers,
                "vector_candidates_count": len(vendor_raster.vector_candidates),
            }
        )
        report["tasks"]["task1_render"] = {"ok": True, "elapsed_ms": t1_ms}
        _notify("step_end", "task1_render", "SUCCESS", f"Rendered PDF pages in {t1_ms}ms")

        is_full_page = mode in ("full_page", "full") or target_size_mm is None
        if is_full_page:
            target_size_mm = (round(brand_raster.page_size_mm[0], 4), round(brand_raster.page_size_mm[1], 4))
            report["target_size_mm"] = list(target_size_mm)

        # --- Task 2: Frame Detection ---
        if is_full_page:
            _notify("step_start", "task2_frame_detect", "IN_PROGRESS", f"Using full page sheet canvas {target_size_mm[0]}x{target_size_mm[1]} mm...")
            t0 = time.perf_counter()
            brand_frame = Frame(
                bbox_mm=(0.0, 0.0, brand_raster.page_size_mm[0], brand_raster.page_size_mm[1]),
                method="full_page",
                confidence=1.0,
                size_err_mm=(0.0, 0.0),
                confirmed=True,
                elapsed_ms=0.0,
            )
            vendor_frame = Frame(
                bbox_mm=(0.0, 0.0, vendor_raster.page_size_mm[0], vendor_raster.page_size_mm[1]),
                method="full_page",
                confidence=1.0,
                size_err_mm=(0.0, 0.0),
                confirmed=True,
                elapsed_ms=0.0,
            )
            brand_det = FrameDetectionReport(target_size_mm, None, None, None, brand_frame)
            vendor_det = FrameDetectionReport(target_size_mm, None, None, None, vendor_frame)
            brand_preview = save_frame_preview(
                brand_raster, brand_det, run_dir / "frame_brand.png"
            )
            vendor_preview = save_frame_preview(
                vendor_raster, vendor_det, run_dir / "frame_vendor.png"
            )
            t2_ms = round((time.perf_counter() - t0) * 1000.0, 2)
            report["tasks"]["task2_frame_detect"] = {
                "ok": True,
                "elapsed_ms": t2_ms,
                "brand": asdict(brand_det),
                "vendor": asdict(vendor_det),
                "previews": {
                    "brand": str(brand_preview),
                    "vendor": str(vendor_preview),
                },
            }
            _notify("step_end", "task2_frame_detect", "SUCCESS", f"Using full page sheet ({target_size_mm[0]:.1f}x{target_size_mm[1]:.1f} mm)")
        else:
            _notify("step_start", "task2_frame_detect", "IN_PROGRESS", f"Detecting target artwork frame {target_size_mm[0]}x{target_size_mm[1]} mm...")
            t0 = time.perf_counter()
            brand_det = detect_frame(brand_raster, target_size_mm, profile)
            vendor_det = detect_frame(vendor_raster, target_size_mm, profile)
            brand_preview = save_frame_preview(
                brand_raster, brand_det, run_dir / "frame_brand.png"
            )
            vendor_preview = save_frame_preview(
                vendor_raster, vendor_det, run_dir / "frame_vendor.png"
            )
            t2_ms = round((time.perf_counter() - t0) * 1000.0, 2)

            report["tasks"]["task2_frame_detect"] = {
                "ok": True,
                "elapsed_ms": t2_ms,
                "brand": asdict(brand_det),
                "vendor": asdict(vendor_det),
                "previews": {
                    "brand": str(brand_preview),
                    "vendor": str(vendor_preview),
                },
            }
            _notify("step_end", "task2_frame_detect", "SUCCESS", f"Detected artwork frames in {t2_ms}ms (Brand: {brand_det.selected.method}, Vendor: {vendor_det.selected.method})")

        # --- Task 3: Confirm & Crop ---
        _notify("step_start", "task3_crop", "IN_PROGRESS", "Cropping pages to detected artboards...")
        t0 = time.perf_counter()
        if not is_full_page:
            brand_frame = confirm_frame(
                brand_det, brand_preview, mode=mode, input_fn=input_fn
            )
            vendor_frame = confirm_frame(
                vendor_det, vendor_preview, mode=mode, input_fn=input_fn
            )
        art_a = crop(brand_raster, brand_frame)
        art_b = crop(vendor_raster, vendor_frame)
        cv2.imwrite(str(run_dir / "brand_cropped.png"), art_a.img)
        cv2.imwrite(str(run_dir / "vendor_cropped.png"), art_b.img)
        t3_ms = round((time.perf_counter() - t0) * 1000.0, 2)

        report["tasks"]["task3_crop"] = {
            "ok": True,
            "elapsed_ms": t3_ms,
            "brand_confirmed_frame": asdict(brand_frame),
            "vendor_confirmed_frame": asdict(vendor_frame),
            "brand_cropped_shape_px": list(art_a.img.shape),
            "vendor_cropped_shape_px": list(art_b.img.shape),
        }
        _notify("step_end", "task3_crop", "SUCCESS", f"Cropped artboards in {t3_ms}ms (Shape: {art_a.img.shape[1]}x{art_a.img.shape[0]} px)")

        # --- Task 4: Size Gate ---
        _notify("step_start", "task4_size_gate", "IN_PROGRESS", "Verifying dimensions and aspect ratio against target...")
        t0 = time.perf_counter()
        gate_res = check_size(art_a, art_b, target_size_mm, profile)
        t4_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        report["tasks"]["task4_size_gate"] = {
            **asdict(gate_res),
            "elapsed_ms": t4_ms,
        }
        if not gate_res.passed:
            report["status"] = gate_res.status
            report["exit_code"] = 3
            report["error"] = gate_res.reason
            _write_report(run_dir / "report.json", report)
            _notify("step_end", "task4_size_gate", "FAILED", f"Size gate check failed: {gate_res.status} - {gate_res.reason}")
            return 3, report, run_dir
        _notify("step_end", "task4_size_gate", "SUCCESS", f"Size gate passed in {t4_ms}ms ({gate_res.status})")

        # --- Task 5: Bring to same coordinate system & Align ---
        _notify("step_start", "task5_align", "IN_PROGRESS", "Performing sub-pixel alignment using RANSAC and Masked ECC...")
        t0 = time.perf_counter()
        align_res, b_aligned, valid_mask, stable_mask, inlier_max_err = align_artboards(
            art_a, art_b, profile=profile, rerender_crop_fn=_rerender_and_crop
        )
        cv2.imwrite(str(run_dir / "A.png"), art_a.img)
        cv2.imwrite(str(run_dir / "B_aligned.png"), b_aligned)
        cv2.imwrite(str(run_dir / "valid_mask.png"), valid_mask)
        cv2.imwrite(str(run_dir / "stable_mask.png"), stable_mask)
        t5_ms = round((time.perf_counter() - t0) * 1000.0, 2)

        report["tasks"]["task5_align"] = {
            **asdict(align_res),
            "inlier_max_err_px": inlier_max_err,
            "elapsed_ms": t5_ms,
        }
        if not align_res.ok:
            report["status"] = "ALIGN_FAIL"
            report["exit_code"] = 2
            report["error"] = align_res.reason
            _write_report(run_dir / "report.json", report)
            _notify("step_end", "task5_align", "FAILED", f"Alignment failed: {align_res.reason}")
            return 2, report, run_dir
        _notify("step_end", "task5_align", "SUCCESS", f"Aligned in {t5_ms}ms (RMSE: {align_res.inlier_rmse_px:.3f} px, Inliers: {align_res.inlier_count})")

        # --- Task 6: Fit Meter & Inspection Visuals ---
        _notify("step_start", "task6_fit_meter", "IN_PROGRESS", "Measuring residual fit on 10x4 grid and generating diagnostic images...")
        t0 = time.perf_counter()
        fit_rep = measure_fit(
            art_a, b_aligned, valid_mask, align_res, inlier_max_err, profile
        )
        max_grid_shift_px = float(
            profile.get("align", {}).get("max_grid_shift_px", 1.0)
        )
        visuals = save_fit_visuals(
            art_a, b_aligned, valid_mask, fit_rep, run_dir, max_grid_shift_px
        )
        t6_ms = round((time.perf_counter() - t0) * 1000.0, 2)

        report["tasks"]["task6_fit_meter"] = {
            **asdict(fit_rep),
            "visuals": visuals,
            "elapsed_ms": t6_ms,
        }

        if fit_rep.passed:
            report["status"] = "PASS"
            report["exit_code"] = 0
            _notify("step_end", "task6_fit_meter", "SUCCESS", f"Fit measurement passed in {t6_ms}ms (Max shift: {fit_rep.grid_max_shift_px:.2f} px)")
        else:
            report["status"] = "FIT_FAIL"
            report["exit_code"] = 2
            report["error"] = fit_rep.reason
            _notify("step_end", "task6_fit_meter", "FAILED", f"Fit measurement failed: {fit_rep.reason}")

        _write_report(run_dir / "report.json", report)
        _notify(
            "complete",
            None,
            "SUCCESS" if report["exit_code"] == 0 else "FAILED",
            f"Pipeline complete with status {report['status']}",
            details={"status": report["status"], "exit_code": report["exit_code"], "run_id": run_id},
        )
        return int(report["exit_code"]), report, run_dir

    except ArtDiffError as exc:
        report["status"] = exc.code
        report["exit_code"] = exc.exit_code
        report["error"] = exc.message
        _write_report(run_dir / "report.json", report)
        _notify("error", None, "FAILED", f"Error: {exc.message}", details={"code": exc.code})
        return exc.exit_code, report, run_dir
    except Exception as exc:
        report["status"] = "INTERNAL_ERROR"
        report["exit_code"] = 1
        report["error"] = str(exc)
        _write_report(run_dir / "report.json", report)
        _notify("error", None, "FAILED", f"Internal Error: {str(exc)}")
        return 1, report, run_dir


def _write_report(path: Path, report: dict[str, Any]) -> None:
    sanitized = _sanitize_for_json(report)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(sanitized, f, indent=2, ensure_ascii=False)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="ARTDIFF Phase 1: Region Selection, Normalization, and Alignment"
    )
    parser.add_argument("--brand", required=True, help="Path to Brand PDF file")
    parser.add_argument("--vendor", required=True, help="Path to Vendor/Supplier PDF file")
    parser.add_argument(
        "--size-mm",
        default=None,
        help="Target artwork size WxH in mm (e.g., 620x250). Prompted in interactive mode if omitted.",
    )
    parser.add_argument(
        "--brand-page",
        type=int,
        default=1,
        help="1-based page number for Brand artwork (default: 1)",
    )
    parser.add_argument(
        "--vendor-page",
        type=int,
        default=1,
        help="1-based page number for Vendor/Supplier artwork (default: 1)",
    )
    parser.add_argument(
        "--profile",
        default=None,
        help="Path to YAML profile (default: artdiff/profiles/default.yaml)",
    )
    parser.add_argument(
        "--mode",
        choices=["interactive", "auto"],
        default="auto",
        help="Confirmation mode: interactive or auto (default: auto)",
    )
    parser.add_argument(
        "--out",
        default="out",
        help="Output root directory (default: out/)",
    )
    parser.add_argument(
        "--run-id",
        default=None,
        help="Optional run identifier subfolder inside --out",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    size_str = args.size_mm
    if not size_str and args.mode == "interactive":
        size_str = input("Enter target artwork size WxH in mm (e.g. 620x250): ").strip()

    if not size_str:
        print(
            "Error: --size-mm WxH (e.g. --size-mm 620x250) is required.",
            file=sys.stderr,
        )
        return 1

    try:
        target_size_mm = parse_size_mm(size_str)
    except ArtDiffError as exc:
        print(f"Error: {exc.message}", file=sys.stderr)
        return exc.exit_code

    exit_code, report, run_dir = run_phase1(
        brand_pdf=args.brand,
        vendor_pdf=args.vendor,
        target_size_mm=target_size_mm,
        brand_page=args.brand_page,
        vendor_page=args.vendor_page,
        profile_path=args.profile,
        mode=args.mode,
        out_root=args.out,
        run_id=args.run_id,
    )
    print(
        f"[Phase 1] status={report['status']} | exit_code={exit_code} | "
        f"report={run_dir / 'report.json'}"
    )
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
