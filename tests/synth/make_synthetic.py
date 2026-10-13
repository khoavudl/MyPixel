"""Script to generate 7 synthetic test PDF pairs and ground truth annotations.

Cases:
  1. Xóa 1 ký tự có dấu (Ơ trong BÁNH QUY BƠ) -> content
  2. Đổi 1 chữ số (320 -> 326) -> content
  3. Xóa 1 dấu % -> content
  4. Dời logo 0.15 mm (<= 0.25 mm) -> shift_only
  5. Dời logo 0.50 mm (> 0.25 mm) -> moved
  6. Thêm 1 dòng chữ mới -> content
  7. Không sửa gì -> 0 vùng
"""

from __future__ import annotations

import json
from pathlib import Path
import cv2
import numpy as np
import pymupdf

from artdiff.core.units import mm_to_pt, bbox_px_to_mm
from artdiff.pipeline_phase1 import run_phase1


def _make_logo_bytes() -> bytes:
    """Generate a 20x20 mm test logo image with rich geometric patterns."""
    img = np.full((240, 240, 3), 245, dtype=np.uint8)
    # Circle badge
    cv2.circle(img, (120, 120), 100, (40, 40, 200), -1)
    # Inner star / polygon
    pts = np.array([
        [120, 40], [145, 95], [205, 95], [155, 135],
        [175, 195], [120, 155], [65, 195], [85, 135],
        [35, 95], [95, 95]
    ], np.int32)
    cv2.fillPoly(img, [pts], (220, 200, 50))
    cv2.circle(img, (120, 120), 30, (255, 255, 255), -1)
    cv2.putText(img, "AG", (95, 132), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (20, 20, 20), 3)
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


def build_pdf(
    out_path: Path,
    text_line1: str = "BANH QUY BO",
    text_line2: str = "Khoi luong tinh: 320 g",
    text_line3: str = "Carbohydrat: 60 g (19 %)",
    text_line4: str = "Chat beo bao hoa: 12,4 g",
    text_line5: str = "Han su dung: 12 thang",
    extra_line: str | None = None,
    logo_offset_mm: tuple[float, float] = (0.0, 0.0),
    page_w_mm: float = 120.0,
    page_h_mm: float = 100.0,
    frame_x_mm: float = 10.0,
    frame_y_mm: float = 10.0,
    frame_w_mm: float = 100.0,
    frame_h_mm: float = 80.0,
) -> None:
    """Build a synthetic test PDF page with vector artboard frame and layout."""
    doc = pymupdf.open()
    page = doc.new_page(width=mm_to_pt(page_w_mm), height=mm_to_pt(page_h_mm))

    # 1. Vector artboard frame
    fx0 = mm_to_pt(frame_x_mm)
    fy0 = mm_to_pt(frame_y_mm)
    fw = mm_to_pt(frame_w_mm)
    fh = mm_to_pt(frame_h_mm)
    page.draw_rect(pymupdf.Rect(fx0, fy0, fx0 + fw, fy0 + fh), color=(0, 0, 0), width=1.0)

    # 2. Insert logo image
    logo_bytes = _make_logo_bytes()
    lx = frame_x_mm + 15.0 + logo_offset_mm[0]
    ly = frame_y_mm + 15.0 + logo_offset_mm[1]
    logo_rect = pymupdf.Rect(mm_to_pt(lx), mm_to_pt(ly), mm_to_pt(lx + 20.0), mm_to_pt(ly + 20.0))
    page.insert_image(logo_rect, stream=logo_bytes)

    # 3. Insert text lines (positions relative to frame)
    tx = frame_x_mm + 45.0
    page.insert_text(pymupdf.Point(mm_to_pt(tx), mm_to_pt(frame_y_mm + 22.0)), text_line1, fontsize=12)
    page.insert_text(pymupdf.Point(mm_to_pt(tx), mm_to_pt(frame_y_mm + 32.0)), text_line2, fontsize=10)
    page.insert_text(pymupdf.Point(mm_to_pt(tx), mm_to_pt(frame_y_mm + 42.0)), text_line3, fontsize=10)
    page.insert_text(pymupdf.Point(mm_to_pt(tx), mm_to_pt(frame_y_mm + 52.0)), text_line4, fontsize=10)
    page.insert_text(pymupdf.Point(mm_to_pt(tx), mm_to_pt(frame_y_mm + 62.0)), text_line5, fontsize=10)

    if extra_line:
        page.insert_text(pymupdf.Point(mm_to_pt(tx), mm_to_pt(frame_y_mm + 72.0)), extra_line, fontsize=10)

    doc.save(str(out_path))
    doc.close()


def generate_all_synthetic_cases(output_base_dir: Path) -> list[dict[str, Any]]:
    """Generate all 7 synthetic cases, run Phase 1, and write truth.json."""
    output_base_dir.mkdir(parents=True, exist_ok=True)
    cases_manifest = []

    case_definitions = [
        {
            "id": "case_1_delete_char",
            "name": "Case 1: Xóa 1 ký tự có dấu (O trong BO)",
            "vendor_kwargs": {"text_line1": "BANH QUY B "},
            "truth": [
                {
                    "id": 1,
                    # Text 'BO' is at tx ~ 45mm + ~22mm offset
                    "bbox_mm": [67.0, 18.0, 4.5, 5.0],
                    "expected_kind": "content",
                    "note": "Xóa ký tự O trong BO",
                }
            ],
        },
        {
            "id": "case_2_change_digit",
            "name": "Case 2: Đổi 1 chữ số (320 -> 326)",
            "vendor_kwargs": {"text_line2": "Khoi luong tinh: 326 g"},
            "truth": [
                {
                    "id": 1,
                    "bbox_mm": [74.5, 28.5, 3.5, 4.5],
                    "expected_kind": "content",
                    "note": "Đổi chữ số 0 thành 6 (320 -> 326)",
                }
            ],
        },
        {
            "id": "case_3_delete_punct",
            "name": "Case 3: Xóa 1 dấu %",
            "vendor_kwargs": {"text_line3": "Carbohydrat: 60 g (19  )"},
            "truth": [
                {
                    "id": 1,
                    "bbox_mm": [80.5, 38.5, 4.5, 4.5],
                    "expected_kind": "content",
                    "note": "Xóa ký hiệu % sau 19",
                }
            ],
        },
        {
            "id": "case_4_shift_small",
            "name": "Case 4: Dời logo 0.15 mm (<= 0.25 mm)",
            "vendor_kwargs": {"logo_offset_mm": (0.15, 0.0)},
            "truth": [
                {
                    "id": 1,
                    "bbox_mm": [15.0, 15.0, 20.15, 20.0],
                    "expected_kind": "shift_only",
                    "note": "Dời logo 0.15 mm sang phải (kỳ vọng shift_only)",
                }
            ],
        },
        {
            "id": "case_5_shift_large",
            "name": "Case 5: Dời logo 0.50 mm (> 0.25 mm)",
            "vendor_kwargs": {"logo_offset_mm": (0.50, 0.0)},
            "truth": [
                {
                    "id": 1,
                    "bbox_mm": [15.0, 15.0, 20.50, 20.0],
                    "expected_kind": "moved",
                    "note": "Dời logo 0.50 mm sang phải (kỳ vọng moved)",
                }
            ],
        },
        {
            "id": "case_6_add_text",
            "name": "Case 6: Thêm 1 dòng chữ mới",
            "vendor_kwargs": {"extra_line": "Xuat xu: Viet Nam"},
            "truth": [
                {
                    "id": 1,
                    "bbox_mm": [45.0, 68.0, 38.0, 5.0],
                    "expected_kind": "content",
                    "note": "Thêm dòng chữ Xuat xu: Viet Nam",
                }
            ],
        },
        {
            "id": "case_7_no_change",
            "name": "Case 7: Bản không sửa gì (0 vùng)",
            "vendor_kwargs": {},
            "truth": [],
        },
    ]

    for cdef in case_definitions:
        case_dir = output_base_dir / cdef["id"]
        case_dir.mkdir(parents=True, exist_ok=True)
        brand_pdf = case_dir / "brand.pdf"
        vendor_pdf = case_dir / "vendor.pdf"

        # Build baseline brand PDF and modified vendor PDF
        build_pdf(brand_pdf)
        build_pdf(vendor_pdf, **cdef["vendor_kwargs"])

        # Run Phase 1 pipeline to generate A.png, B_aligned.png, valid_mask.png, report.json
        exit_code, rep, run_dir = run_phase1(
            brand_pdf=brand_pdf,
            vendor_pdf=vendor_pdf,
            target_size_mm=(100.0, 80.0),
            mode="auto",
            out_root=output_base_dir,
            run_id=cdef["id"],
        )
        assert exit_code == 0, f"Phase 1 failed on {cdef['id']}"

        # Refine truth bbox_mm based on actual diff if applicable
        truth_items = cdef["truth"]
        if truth_items and (case_dir / "A.png").exists() and (case_dir / "B_aligned.png").exists():
            A = cv2.imread(str(case_dir / "A.png"))
            B = cv2.imread(str(case_dir / "B_aligned.png"))
            diff = np.max(cv2.absdiff(A, B), axis=2)
            px_per_mm = rep["profile"]["px_per_mm"]

            # For content/shifted items, adjust bbox_mm to wrap diff pixels closely
            for t in truth_items:
                bx, by, bw, bh = t["bbox_mm"]
                px_x = int(round(bx * px_per_mm))
                px_y = int(round(by * px_per_mm))
                px_w = int(round(bw * px_per_mm))
                px_h = int(round(bh * px_per_mm))
                # Search within margin
                m = 10
                sub_y0 = max(0, px_y - m)
                sub_y1 = min(diff.shape[0], px_y + px_h + m)
                sub_x0 = max(0, px_x - m)
                sub_x1 = min(diff.shape[1], px_x + px_w + m)

                ys, xs = np.where(diff[sub_y0:sub_y1, sub_x0:sub_x1] > 30)
                if len(xs) > 0:
                    real_x0 = sub_x0 + int(xs.min())
                    real_y0 = sub_y0 + int(ys.min())
                    real_w = int(xs.max() - xs.min() + 1)
                    real_h = int(ys.max() - ys.min() + 1)
                    # pad slightly 3px
                    pad = 3
                    real_x0 = max(0, real_x0 - pad)
                    real_y0 = max(0, real_y0 - pad)
                    real_w = min(diff.shape[1] - real_x0, real_w + 2 * pad)
                    real_h = min(diff.shape[0] - real_y0, real_h + 2 * pad)
                    mm_box = bbox_px_to_mm((real_x0, real_y0, real_w, real_h), px_per_mm)
                    t["bbox_mm"] = [round(x, 2) for x in mm_box]
                    t["bbox_px"] = [real_x0, real_y0, real_w, real_h]

        truth_file = case_dir / "truth.json"
        with open(truth_file, "w", encoding="utf-8") as f:
            json.dump(truth_items, f, indent=2, ensure_ascii=False)

        # Render preview
        A_img = cv2.imread(str(case_dir / "A.png"))
        if A_img is not None:
            for it in truth_items:
                if "bbox_px" in it:
                    px, py, pw, ph = it["bbox_px"]
                else:
                    px_per_mm = rep["profile"]["px_per_mm"]
                    px, py, pw, ph = [int(round(v * px_per_mm)) for v in it["bbox_mm"]]
                color = (0, 0, 255) if it["expected_kind"] == "content" else (
                    (0, 255, 0) if it["expected_kind"] == "shift_only" else (0, 255, 255)
                )
                cv2.rectangle(A_img, (px, py), (px + pw, py + ph), color, 2)
                cv2.putText(
                    A_img,
                    f"{it['expected_kind']}",
                    (px, max(20, py - 6)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    color,
                    2,
                )
            cv2.imwrite(str(case_dir / "truth_preview.png"), A_img)

        cases_manifest.append({
            "id": cdef["id"],
            "name": cdef["name"],
            "dir": str(case_dir),
            "truth_count": len(truth_items),
        })

    manifest_file = output_base_dir / "manifest.json"
    with open(manifest_file, "w", encoding="utf-8") as f:
        json.dump(cases_manifest, f, indent=2, ensure_ascii=False)

    print(f"Successfully generated {len(cases_manifest)} synthetic test cases in {output_base_dir}")
    return cases_manifest


if __name__ == "__main__":
    generate_all_synthetic_cases(Path("tests/synth/runs"))
