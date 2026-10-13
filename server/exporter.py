"""Audit report exporter (HTML and JSON formats)."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

from server.config import OUT_DIR
from server.schemas import Annotation


def export_audit_report(
    run_id: str,
    annotations: list[Annotation],
    export_format: str = "html",
) -> Path:
    """Generate and save audit inspection report into out/<run_id>/."""
    run_dir = OUT_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    report_path = run_dir / "report.json"
    report_data: dict[str, Any] = {}
    if report_path.is_file():
        try:
            with open(report_path, "r", encoding="utf-8") as f:
                report_data = json.load(f)
        except Exception:
            pass

    # Save annotations.json
    annotations_json_path = run_dir / "annotations.json"
    with open(annotations_json_path, "w", encoding="utf-8") as f:
        json.dump([a.model_dump() for a in annotations], f, indent=2, ensure_ascii=False)

    if export_format == "json":
        summary_path = run_dir / "audit_report.json"
        summary = {
            "run_id": run_id,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "pipeline_report": report_data,
            "annotations_count": len(annotations),
            "annotations": [a.model_dump() for a in annotations],
        }
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        return summary_path

    # Generate standalone HTML Report
    html_path = run_dir / "audit_report.html"
    target_size = report_data.get("target_size_mm", ["-", "-"])
    brand_input = report_data.get("inputs", {}).get("brand", {})
    vendor_input = report_data.get("inputs", {}).get("vendor", {})

    rows_html = ""
    for idx, ann in enumerate(annotations, 1):
        severity_color = {
            "critical": "#ef4444",
            "major": "#f97316",
            "minor": "#eab308",
        }.get(ann.severity, "#6b7280")

        bbox_str = (
            f"X: {ann.bbox_mm[0]:.2f}, Y: {ann.bbox_mm[1]:.2f}, W: {ann.bbox_mm[2]:.2f}, H: {ann.bbox_mm[3]:.2f} mm"
            if ann.bbox_mm
            else f"Norm: [{ann.norm_x:.3f}, {ann.norm_y:.3f}, {ann.norm_w:.3f}, {ann.norm_h:.3f}]"
        )

        rows_html += f"""
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; text-align: center;">{idx}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; color: white; background-color: {severity_color}; text-transform: uppercase;">
              {ann.severity}
            </span>
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">{ann.tag}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-family: monospace; font-size: 13px;">{bbox_str}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">{ann.note or '<i>(Không có ghi chú)</i>'}</td>
        </tr>
        """

    if not annotations:
        rows_html = """
        <tr>
          <td colspan="5" style="padding: 20px; text-align: center; color: #6b7280; font-style: italic;">
            Không có lỗi hoặc ghi chú nào được lưu cho lần chạy này.
          </td>
        </tr>
        """

    html_content = f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Biên Bản Kiểm Định Bao Bì - {run_id}</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 40px;
      background-color: #f9fafb;
      color: #111827;
    }}
    .container {{
      max-width: 960px;
      margin: 0 auto;
      background: white;
      padding: 32px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }}
    .header {{
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }}
    .meta-grid {{
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 24px;
      background: #f3f4f6;
      padding: 16px;
      border-radius: 6px;
      font-size: 14px;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
    }}
    th {{
      background: #f3f4f6;
      padding: 10px;
      text-align: left;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2px solid #d1d5db;
    }}
    .print-btn {{
      background: #2563eb;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      float: right;
    }}
    @media print {{
      .print-btn {{ display: none; }}
      body {{ background: white; padding: 0; }}
      .container {{ box-shadow: none; padding: 0; }}
    }}
  </style>
</head>
<body>
  <div class="container">
    <button class="print-btn" onclick="window.print()">In hoặc Lưu PDF</button>
    <div class="header">
      <h1 style="margin: 0 0 8px 0; color: #1e3a8a;">BIÊN BẢN KIỂM ĐỊNH BAO BÌ (ARTDIFF AUDIT REPORT)</h1>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">Mã kiểm tra: <strong>{run_id}</strong> | Thời gian: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
    </div>

    <div class="meta-grid">
      <div><strong>File Brand (Gốc):</strong> {brand_input.get('pdf_path', '-')} (Trang {brand_input.get('page_number', 1)})</div>
      <div><strong>File Vendor (Nhà in):</strong> {vendor_input.get('pdf_path', '-')} (Trang {vendor_input.get('page_number', 1)})</div>
      <div><strong>Khổ thiết kế mục tiêu:</strong> {target_size[0]} × {target_size[1]} mm</div>
      <div><strong>Trạng thái căn chỉnh:</strong> <span style="font-weight: bold; color: {'#16a34a' if report_data.get('status') == 'PASS' else '#dc2626'}">{report_data.get('status', 'N/A')}</span></div>
    </div>

    <h2 style="font-size: 18px; margin-top: 24px; color: #374151;">Danh sách Sai lệch & Bắt lỗi ({len(annotations)} mục)</h2>
    <table>
      <thead>
        <tr>
          <th style="width: 50px; text-align: center;">STT</th>
          <th style="width: 100px;">Mức độ</th>
          <th style="width: 120px;">Loại lỗi</th>
          <th style="width: 220px;">Toạ độ (mm)</th>
          <th>Ghi chú chi tiết</th>
        </tr>
      </thead>
      <tbody>
        {rows_html}
      </tbody>
    </table>
  </div>
</body>
</html>
"""
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    return html_path
