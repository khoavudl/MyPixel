"""Audit report exporter supporting DOCX, PDF, HTML, and JSON formats.

Generates professional inspection reports with:
- Metadata Header (Inspection ID, Date, Inspector, Old Version, New Version, Target Size)
- Section 1: Overview (Full layout with marked defect boxes & #1, #2... badges)
- Section 2: Defect Details (Side-by-side cropped comparisons with 10% padding + Notes)
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any

import cv2
from PIL import Image, ImageDraw, ImageFont
import docx
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Inches, Pt, RGBColor
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    Image as RLImage,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table as RLTable,
    TableStyle,
)

from server.config import OUT_DIR
from server.schemas import Annotation

# Register system TrueType font for ReportLab Unicode (Vietnamese accents) support
PDF_FONT_NAME = "Helvetica"
PDF_FONT_BOLD = "Helvetica-Bold"

for candidate_path in [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]:
    if os.path.exists(candidate_path):
        try:
            pdfmetrics.registerFont(TTFont("CustomArial", candidate_path))
            PDF_FONT_NAME = "CustomArial"
            # Try bold
            bold_path = candidate_path.replace("Arial.ttf", "Arial Bold.ttf").replace(
                "DejaVuSans.ttf", "DejaVuSans-Bold.ttf"
            )
            if os.path.exists(bold_path):
                pdfmetrics.registerFont(TTFont("CustomArial-Bold", bold_path))
                PDF_FONT_BOLD = "CustomArial-Bold"
            else:
                PDF_FONT_BOLD = "CustomArial"
            break
        except Exception:
            pass


def _get_font(size: int = 16) -> ImageFont.ImageFont | ImageFont.FreeTypeFont:
    """Load TrueType font or fallback to default for Pillow."""
    font_candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for fp in font_candidates:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size=size)
            except Exception:
                pass
    return ImageFont.load_default()


def generate_overview_image(
    run_dir: Path,
    base_image_path: Path,
    annotations: list[Annotation],
    output_path: Path,
) -> Path | None:
    """Render full artwork overview with red bounding boxes and #1, #2... badges."""
    if not base_image_path.is_file():
        return None

    try:
        with Image.open(base_image_path) as img:
            img = img.convert("RGB")
            orig_w, orig_h = img.size

            # Create high-res drawing canvas
            draw = ImageDraw.Draw(img)
            scale = max(1.0, min(orig_w, orig_h) / 1200.0)

            line_width = max(3, int(4 * scale))
            font_size = max(16, int(20 * scale))
            badge_font = _get_font(font_size)

            for idx, ann in enumerate(annotations, 1):
                x1 = int(ann.norm_x * orig_w)
                y1 = int(ann.norm_y * orig_h)
                x2 = int((ann.norm_x + ann.norm_w) * orig_w)
                y2 = int((ann.norm_y + ann.norm_h) * orig_h)

                # Ensure non-zero rect
                if x2 <= x1:
                    x2 = min(orig_w, x1 + 10)
                if y2 <= y1:
                    y2 = min(orig_h, y1 + 10)

                # Draw outer contrasting stroke + inner vibrant red box
                box_color = (220, 38, 38)
                draw.rectangle([x1, y1, x2, y2], outline=box_color, width=line_width)

                # Badge dimensions & placement
                label_text = f"#{idx}"
                text_bbox = badge_font.getbbox(label_text)
                text_w = text_bbox[2] - text_bbox[0]
                text_h = text_bbox[3] - text_bbox[1]

                pad_h = int(6 * scale)
                pad_v = int(4 * scale)
                badge_w = text_w + pad_h * 2
                badge_h = text_h + pad_v * 2

                # Position badge slightly above top-left of box
                bx1 = x1
                by1 = y1 - badge_h - int(4 * scale)
                if by1 < 0:
                    by1 = y1 + int(4 * scale)  # inside if at top edge

                bx2 = min(orig_w - 1, bx1 + badge_w)
                by2 = by1 + badge_h

                # Draw badge background pill and label
                draw.rounded_rectangle(
                    [bx1, by1, bx2, by2],
                    radius=max(3, int(4 * scale)),
                    fill=(220, 38, 38),
                    outline=(255, 255, 255),
                    width=max(1, int(1.5 * scale)),
                )
                text_x = bx1 + pad_h
                text_y = by1 + pad_v - text_bbox[1]
                draw.text(
                    (text_x, text_y),
                    label_text,
                    fill=(255, 255, 255),
                    font=badge_font,
                )

            # Downsample if overly massive for document embedding (keep max 2400px width)
            max_doc_w = 2400
            if orig_w > max_doc_w:
                target_h = int(orig_h * (max_doc_w / orig_w))
                img = img.resize((max_doc_w, target_h), Image.Resampling.LANCZOS)

            img.save(output_path, format="PNG", optimize=True)
            return output_path
    except Exception as exc:
        print(f"Error generating overview image: {exc}")
        return None


def crop_defect_roi(
    image_path: Path,
    ann: Annotation,
    output_path: Path,
    padding_ratio: float = 0.10,
    max_pixel_w: int = 1000,
) -> Path | None:
    """Crop defect region with +10% padding on each dimension."""
    if not image_path.is_file():
        return None

    try:
        with Image.open(image_path) as img:
            img = img.convert("RGB")
            orig_w, orig_h = img.size

            bw = ann.norm_w * orig_w
            bh = ann.norm_h * orig_h
            pad_x = bw * padding_ratio
            pad_y = bh * padding_ratio

            x1 = max(0, int(ann.norm_x * orig_w - pad_x))
            y1 = max(0, int(ann.norm_y * orig_h - pad_y))
            x2 = min(orig_w, int((ann.norm_x + ann.norm_w) * orig_w + pad_x))
            y2 = min(orig_h, int((ann.norm_y + ann.norm_h) * orig_h + pad_y))

            if x2 <= x1:
                x2 = min(orig_w, x1 + 20)
            if y2 <= y1:
                y2 = min(orig_h, y1 + 20)

            cropped = img.crop((x1, y1, x2, y2))
            cw, ch = cropped.size

            # If crop is excessively large, scale down gracefully
            if cw > max_pixel_w:
                target_h = int(ch * (max_pixel_w / cw))
                cropped = cropped.resize(
                    (max_pixel_w, target_h), Image.Resampling.LANCZOS
                )

            cropped.save(output_path, format="PNG")
            return output_path
    except Exception as exc:
        print(f"Error cropping defect ROI: {exc}")
        return None


def _set_cell_background(cell: Any, fill_hex: str) -> None:
    """Set table cell background color in docx."""
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)


def _set_cell_margins(cell: Any, top: int = 120, bottom: int = 120, left: int = 140, right: int = 140) -> None:
    """Set inner cell padding in docx (values in twips, 20 twips = 1 pt)."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement("w:tcMar")
    for m, val in [("top", top), ("bottom", bottom), ("left", left), ("right", right)]:
        node = OxmlElement(f"w:{m}")
        node.set(qn("w:w"), str(val))
        node.set(qn("w:type"), "dxa")
        tcMar.append(node)
    tcPr.append(tcMar)


def export_docx_report(
    run_dir: Path,
    run_id: str,
    report_data: dict[str, Any],
    annotations: list[Annotation],
    inspector_name: str | None = None,
) -> Path:
    """Generate Word (.docx) inspection report."""
    output_path = run_dir / f"report_{run_id}.docx"
    doc = docx.Document()

    # Page Margins (0.5 in everywhere for maximum layout breadth)
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(0.5)
        section.bottom_margin = Inches(0.5)
        section.left_margin = Inches(0.5)
        section.right_margin = Inches(0.5)

    is_single = (
        report_data.get("mode") == "single"
        or report_data.get("run_type") == "single"
        or (run_dir / "single_cropped.png").is_file()
    )

    # Resolve image paths
    brand_path = run_dir / "brand_cropped.png"
    vendor_path = run_dir / "vendor_cropped.png"
    if not vendor_path.is_file() and (run_dir / "B_aligned.png").is_file():
        vendor_path = run_dir / "B_aligned.png"
    single_path = run_dir / "single_cropped.png"

    overview_base_path = single_path if is_single else vendor_path
    if not overview_base_path.is_file():
        overview_base_path = brand_path

    # Generate Overview image with badges
    overview_img_path = run_dir / "report_overview_annotated.png"
    if overview_base_path.is_file():
        generate_overview_image(run_dir, overview_base_path, annotations, overview_img_path)

    # Crops directory
    crops_dir = run_dir / "report_crops"
    crops_dir.mkdir(parents=True, exist_ok=True)

    # 1. Title
    title_p = doc.add_paragraph()
    title_run = title_p.add_run("ARTWORK REPORT")
    title_run.font.name = "Arial"
    title_run.font.size = Pt(20)
    title_run.font.bold = True
    title_run.font.color.rgb = RGBColor(30, 58, 138)  # Deep Navy #1e3a8a
    title_p.paragraph_format.space_after = Pt(4)

    # Sub-header meta line
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    target_size = report_data.get("target_size_mm", ["-", "-"])
    # Meta Table
    meta_table = doc.add_table(rows=2, cols=3)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_table.autofit = False

    meta_cells = meta_table.rows[0].cells
    meta_cells[0].text = f"Inspection ID:\n{run_id}"
    meta_cells[1].text = f"Date & Time:\n{now_str}"
    meta_cells[2].text = f"Prepared by:\n{inspector_name or 'N/A'}"

    meta_cells_2 = meta_table.rows[1].cells
    meta_cells_2[0].text = f"Target Size:\n{target_size[0]} × {target_size[1]} mm"

    if is_single:
        single_in = report_data.get("inputs", {}).get("single", {})
        fname = single_in.get("filename") or Path(single_in.get("pdf_path", "artwork.pdf")).name
        p_num = single_in.get("page", 1)
        meta_cells_2[1].text = f"Artwork File:\n{fname} (P. {p_num})"
        meta_cells_2[2].text = ""
    else:
        brand_in = report_data.get("inputs", {}).get("brand", {})
        vendor_in = report_data.get("inputs", {}).get("vendor", {})
        b_name = Path(brand_in.get("pdf_path", "old_version.pdf")).name
        v_name = Path(vendor_in.get("pdf_path", "new_version.pdf")).name
        meta_cells_2[1].text = f"Old Version:\n{b_name} (P. {brand_in.get('page_number', 1)})"
        meta_cells_2[2].text = f"New Version:\n{v_name} (P. {vendor_in.get('page_number', 1)})"

    for row in meta_table.rows:
        for cell in row.cells:
            _set_cell_background(cell, "F8FAFC")
            _set_cell_margins(cell, 80, 80, 100, 100)
            for p in cell.paragraphs:
                p.paragraph_format.space_after = Pt(2)
                for run in p.runs:
                    run.font.name = "Arial"
                    run.font.size = Pt(9.5)

    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # 2. Section 1: Overview
    sec1_p = doc.add_paragraph()
    sec1_run = sec1_p.add_run("SECTION 1: OVERVIEW")
    sec1_run.font.name = "Arial"
    sec1_run.font.size = Pt(13)
    sec1_run.font.bold = True
    sec1_run.font.color.rgb = RGBColor(15, 23, 42)
    sec1_p.paragraph_format.space_after = Pt(8)

    if overview_img_path.is_file():
        p_img = doc.add_paragraph()
        p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_img.paragraph_format.space_after = Pt(12)
        p_img.add_run().add_picture(str(overview_img_path), width=Inches(7.2))

    # Page break before details table
    doc.add_page_break()

    # 3. Section 2: Defect Details
    sec2_p = doc.add_paragraph()
    sec2_run = sec2_p.add_run("SECTION 2: DEFECT DETAILS")
    sec2_run.font.name = "Arial"
    sec2_run.font.size = Pt(13)
    sec2_run.font.bold = True
    sec2_run.font.color.rgb = RGBColor(15, 23, 42)
    sec2_p.paragraph_format.space_after = Pt(8)

    # Details Table
    if is_single:
        headers = ["No.", "Reference Image", "Notes"]
        col_widths = [Inches(0.6), Inches(4.0), Inches(2.6)]
    else:
        headers = ["No.", "Old Version", "New Version", "Notes"]
        col_widths = [Inches(0.55), Inches(2.35), Inches(2.35), Inches(2.0)]

    table = doc.add_table(rows=1 + len(annotations) if annotations else 2, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    # Header Row
    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].text = title
        hdr_cells[i].width = col_widths[i]
        _set_cell_background(hdr_cells[i], "E2E8F0")  # Slate-200
        _set_cell_margins(hdr_cells[i], 120, 120, 120, 120)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 else WD_ALIGN_PARAGRAPH.LEFT
        for run in p.runs:
            run.font.name = "Arial"
            run.font.bold = True
            run.font.size = Pt(10)
            run.font.color.rgb = RGBColor(30, 41, 59)

    # Populate defect rows
    if not annotations:
        empty_cell = table.rows[1].cells[0]
        empty_cell.merge(table.rows[1].cells[-1])
        empty_cell.text = "No defects or annotations recorded for this inspection."
        _set_cell_margins(empty_cell, 160, 160, 160, 160)
        p = empty_cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in p.runs:
            run.font.name = "Arial"
            run.font.italic = True
            run.font.size = Pt(10)
            run.font.color.rgb = RGBColor(100, 116, 139)
    else:
        for idx, ann in enumerate(annotations, 1):
            row_cells = table.rows[idx].cells
            for c_i, w in enumerate(col_widths):
                row_cells[c_i].width = w
                _set_cell_margins(row_cells[c_i], 100, 100, 100, 100)

            # Col 0: No.
            p_no = row_cells[0].paragraphs[0]
            p_no.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run_no = p_no.add_run(f"#{idx}")
            run_no.font.name = "Arial"
            run_no.font.bold = True
            run_no.font.size = Pt(11)
            run_no.font.color.rgb = RGBColor(220, 38, 38)

            if is_single:
                # Col 1: Single crop
                crop_path = crops_dir / f"crop_{idx}_ref.png"
                crop_defect_roi(single_path, ann, crop_path, padding_ratio=0.10)
                if crop_path.is_file():
                    p_img = row_cells[1].paragraphs[0]
                    p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    p_img.add_run().add_picture(str(crop_path), width=Inches(3.8))
                # Col 2: Notes
                p_note = row_cells[2].paragraphs[0]
                run_note = p_note.add_run(ann.note if ann.note else "(No notes provided)")
                run_note.font.name = "Arial"
                run_note.font.size = Pt(10)
                if not ann.note:
                    run_note.font.italic = True
                    run_note.font.color.rgb = RGBColor(148, 163, 184)
            else:
                # Col 1: Old Version (Brand)
                old_crop = crops_dir / f"crop_{idx}_old.png"
                crop_defect_roi(brand_path, ann, old_crop, padding_ratio=0.10)
                if old_crop.is_file():
                    p_old = row_cells[1].paragraphs[0]
                    p_old.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    p_old.add_run().add_picture(str(old_crop), width=Inches(2.2))

                # Col 2: New Version (Vendor)
                new_crop = crops_dir / f"crop_{idx}_new.png"
                crop_defect_roi(vendor_path, ann, new_crop, padding_ratio=0.10)
                if new_crop.is_file():
                    p_new = row_cells[2].paragraphs[0]
                    p_new.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    p_new.add_run().add_picture(str(new_crop), width=Inches(2.2))

                # Col 3: Notes
                p_note = row_cells[3].paragraphs[0]
                run_note = p_note.add_run(ann.note if ann.note else "(No notes provided)")
                run_note.font.name = "Arial"
                run_note.font.size = Pt(10)
                if not ann.note:
                    run_note.font.italic = True
                    run_note.font.color.rgb = RGBColor(148, 163, 184)

    doc.save(output_path)
    return output_path


def export_pdf_report(
    run_dir: Path,
    run_id: str,
    report_data: dict[str, Any],
    annotations: list[Annotation],
    inspector_name: str | None = None,
) -> Path:
    """Generate Print-Ready PDF inspection report."""
    output_path = run_dir / f"report_{run_id}.pdf"

    # Setup Document with 0.5 in margins (36 pt)
    margin = 36
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
    )

    usable_width = A4[0] - 2 * margin  # ~523.27 pt

    is_single = (
        report_data.get("mode") == "single"
        or report_data.get("run_type") == "single"
        or (run_dir / "single_cropped.png").is_file()
    )

    brand_path = run_dir / "brand_cropped.png"
    vendor_path = run_dir / "vendor_cropped.png"
    if not vendor_path.is_file() and (run_dir / "B_aligned.png").is_file():
        vendor_path = run_dir / "B_aligned.png"
    single_path = run_dir / "single_cropped.png"

    overview_base_path = single_path if is_single else vendor_path
    if not overview_base_path.is_file():
        overview_base_path = brand_path

    # Generate Overview image if needed
    overview_img_path = run_dir / "report_overview_annotated.png"
    if overview_base_path.is_file() and not overview_img_path.is_file():
        generate_overview_image(run_dir, overview_base_path, annotations, overview_img_path)

    crops_dir = run_dir / "report_crops"
    crops_dir.mkdir(parents=True, exist_ok=True)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName=PDF_FONT_BOLD,
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#1e3a8a"),
        spaceAfter=6,
    )
    meta_style = ParagraphStyle(
        "MetaText",
        parent=styles["Normal"],
        fontName=PDF_FONT_NAME,
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor("#334155"),
    )
    meta_bold = ParagraphStyle(
        "MetaTextBold",
        parent=meta_style,
        fontName=PDF_FONT_BOLD,
        textColor=colors.HexColor("#0f172a"),
    )
    sec_title_style = ParagraphStyle(
        "SecTitle",
        parent=styles["Normal"],
        fontName=PDF_FONT_BOLD,
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=10,
        spaceAfter=4,
    )
    sec_desc_style = ParagraphStyle(
        "SecDesc",
        parent=styles["Normal"],
        fontName=PDF_FONT_NAME,
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=6,
    )
    table_hdr_style = ParagraphStyle(
        "TableHdr",
        parent=styles["Normal"],
        fontName=PDF_FONT_BOLD,
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#1e293b"),
        alignment=1,  # Center
    )
    table_no_style = ParagraphStyle(
        "TableNo",
        parent=styles["Normal"],
        fontName=PDF_FONT_BOLD,
        fontSize=10,
        leading=12,
        textColor=colors.HexColor("#dc2626"),
        alignment=1,
    )
    table_note_style = ParagraphStyle(
        "TableNote",
        parent=styles["Normal"],
        fontName=PDF_FONT_NAME,
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor("#1e293b"),
    )

    story: list[Any] = []

    # Title
    story.append(Paragraph("ARTWORK REPORT", title_title_style if "title_title_style" in locals() else title_style))

    # Meta Table
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    target_size = report_data.get("target_size_mm", ["-", "-"])

    if is_single:
        single_in = report_data.get("inputs", {}).get("single", {})
        fname = single_in.get("filename") or Path(single_in.get("pdf_path", "artwork.pdf")).name
        p_num = single_in.get("page", 1)
        meta_data = [
            [
                Paragraph(f"<b>Inspection ID:</b> {run_id}", meta_style),
                Paragraph(f"<b>Date:</b> {now_str}", meta_style),
                Paragraph(f"<b>Prepared by:</b> {inspector_name or 'N/A'}", meta_style),
            ],
            [
                Paragraph(f"<b>Target Size:</b> {target_size[0]} × {target_size[1]} mm", meta_style),
                Paragraph(f"<b>Artwork File:</b> {fname} (P. {p_num})", meta_style),
                Paragraph("", meta_style),
            ],
        ]
    else:
        brand_in = report_data.get("inputs", {}).get("brand", {})
        vendor_in = report_data.get("inputs", {}).get("vendor", {})
        b_name = Path(brand_in.get("pdf_path", "old_version.pdf")).name
        v_name = Path(vendor_in.get("pdf_path", "new_version.pdf")).name
        meta_data = [
            [
                Paragraph(f"<b>Inspection ID:</b> {run_id}", meta_style),
                Paragraph(f"<b>Date:</b> {now_str}", meta_style),
                Paragraph(f"<b>Prepared by:</b> {inspector_name or 'N/A'}", meta_style),
            ],
            [
                Paragraph(f"<b>Target Size:</b> {target_size[0]} × {target_size[1]} mm", meta_style),
                Paragraph(f"<b>Old Version:</b> {b_name} (P. {brand_in.get('page_number', 1)})", meta_style),
                Paragraph(f"<b>New Version:</b> {v_name} (P. {vendor_in.get('page_number', 1)})", meta_style),
            ],
        ]
    col_w = usable_width / 3.0
    meta_table = RLTable(meta_data, colWidths=[col_w, col_w, col_w])
    meta_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#f1f5f9")),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(meta_table)
    story.append(Spacer(1, 8))

    # Section 1: Overview
    story.append(Paragraph("SECTION 1: OVERVIEW", sec_title_style))
    story.append(Spacer(1, 4))

    if overview_img_path.is_file():
        try:
            with Image.open(overview_img_path) as im:
                ow, oh = im.size
            disp_w = usable_width
            disp_h = disp_w * (oh / ow)
            # Limit height on page 1 so it fits neatly
            max_h = 360
            if disp_h > max_h:
                disp_w = max_h * (ow / oh)
                disp_h = max_h
            story.append(RLImage(str(overview_img_path), width=disp_w, height=disp_h))
        except Exception as exc:
            print(f"Error embedding overview in PDF: {exc}")

    # Page Break for Section 2 Details
    story.append(PageBreak())

    # Section 2: Defect Details
    story.append(Paragraph("SECTION 2: DEFECT DETAILS", sec_title_style))
    story.append(Spacer(1, 6))
    story.append(Spacer(1, 4))

    if is_single:
        table_widths = [35, 275, 213]
        table_data = [[
            Paragraph("No.", table_hdr_style),
            Paragraph("Reference Image", table_hdr_style),
            Paragraph("Notes", table_hdr_style),
        ]]
    else:
        table_widths = [32, 185, 185, 121]
        table_data = [[
            Paragraph("No.", table_hdr_style),
            Paragraph("Old Version", table_hdr_style),
            Paragraph("New Version", table_hdr_style),
            Paragraph("Notes", table_hdr_style),
        ]]

    if not annotations:
        empty_text = Paragraph(
            "<i>No defects or annotations recorded for this inspection.</i>",
            table_note_style,
        )
        table_data.append([empty_text] * len(table_widths))
    else:
        for idx, ann in enumerate(annotations, 1):
            no_p = Paragraph(f"#{idx}", table_no_style)
            note_text = ann.note if ann.note else "<i>(No notes provided)</i>"
            note_p = Paragraph(note_text, table_note_style)

            if is_single:
                crop_path = crops_dir / f"crop_{idx}_ref.png"
                if not crop_path.is_file():
                    crop_defect_roi(single_path, ann, crop_path, padding_ratio=0.10)

                img_elem: Any = ""
                if crop_path.is_file():
                    with Image.open(crop_path) as im:
                        cw, ch = im.size
                    max_w = 265
                    max_h = 160
                    scale = min(max_w / cw, max_h / ch)
                    img_elem = RLImage(str(crop_path), width=cw * scale, height=ch * scale)

                table_data.append([no_p, img_elem, note_p])
            else:
                old_crop = crops_dir / f"crop_{idx}_old.png"
                if not old_crop.is_file():
                    crop_defect_roi(brand_path, ann, old_crop, padding_ratio=0.10)

                new_crop = crops_dir / f"crop_{idx}_new.png"
                if not new_crop.is_file():
                    crop_defect_roi(vendor_path, ann, new_crop, padding_ratio=0.10)

                old_img: Any = ""
                if old_crop.is_file():
                    with Image.open(old_crop) as im:
                        ow, oh = im.size
                    scale_o = min(175 / ow, 130 / oh)
                    old_img = RLImage(str(old_crop), width=ow * scale_o, height=oh * scale_o)

                new_img: Any = ""
                if new_crop.is_file():
                    with Image.open(new_crop) as im:
                        nw, nh = im.size
                    scale_n = min(175 / nw, 130 / nh)
                    new_img = RLImage(str(new_crop), width=nw * scale_n, height=nh * scale_n)

                table_data.append([no_p, old_img, new_img, note_p])

    defect_table = RLTable(table_data, colWidths=table_widths, repeatRows=1)
    defect_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(defect_table)

    doc.build(story)
    return output_path


def export_audit_report(
    run_id: str,
    annotations: list[Annotation],
    export_format: str = "docx",
    inspector_name: str | None = None,
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
        summary_path = run_dir / f"report_{run_id}.json"
        summary = {
            "run_id": run_id,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "inspector_name": inspector_name,
            "pipeline_report": report_data,
            "annotations_count": len(annotations),
            "annotations": [a.model_dump() for a in annotations],
        }
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        return summary_path

    if export_format == "docx":
        return export_docx_report(
            run_dir=run_dir,
            run_id=run_id,
            report_data=report_data,
            annotations=annotations,
            inspector_name=inspector_name,
        )

    if export_format == "pdf":
        return export_pdf_report(
            run_dir=run_dir,
            run_id=run_id,
            report_data=report_data,
            annotations=annotations,
            inspector_name=inspector_name,
        )

    # Fallback to HTML
    html_path = run_dir / f"report_{run_id}.html"
    target_size = report_data.get("target_size_mm", ["-", "-"])
    brand_input = report_data.get("inputs", {}).get("brand", {})
    vendor_input = report_data.get("inputs", {}).get("vendor", {})

    rows_html = ""
    for idx, ann in enumerate(annotations, 1):
        rows_html += f"""
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; text-align: center;">#{idx}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">{ann.note or '<i>(No notes provided)</i>'}</td>
        </tr>
        """

    if not annotations:
        rows_html = """
        <tr>
          <td colspan="2" style="padding: 20px; text-align: center; color: #6b7280; font-style: italic;">
            No defects or annotations recorded for this inspection.
          </td>
        </tr>
        """

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Artwork Report - {run_id}</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0; padding: 40px; background-color: #f8fafc; color: #0f172a;
    }}
    .container {{
      max-width: 900px; margin: 0 auto; background: white; padding: 32px;
      border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }}
    .header {{ border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px; }}
    .meta-grid {{
      display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;
      background: #f1f5f9; padding: 14px; border-radius: 6px; font-size: 13px; margin-bottom: 24px;
    }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 16px; }}
    th {{ background: #f1f5f9; padding: 10px; text-align: left; font-size: 13px; border-bottom: 2px solid #cbd5e1; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0 0 6px 0; color: #1e3a8a;">ARTWORK REPORT</h1>
      <p style="margin: 0; color: #64748b; font-size: 13px;">ID: <strong>{run_id}</strong> | Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Prepared by: <strong>{inspector_name or 'N/A'}</strong></p>
    </div>
    <div class="meta-grid">
      <div><strong>Old Version:</strong> {Path(brand_input.get('pdf_path', '-')).name} (Page {brand_input.get('page_number', 1)})</div>
      <div><strong>New Version:</strong> {Path(vendor_input.get('pdf_path', '-')).name} (Page {vendor_input.get('page_number', 1)})</div>
      <div><strong>Target Size:</strong> {target_size[0]} × {target_size[1]} mm</div>
    </div>
    <h2>Defect Details ({len(annotations)} items)</h2>
    <table>
      <thead>
        <tr>
          <th style="width: 60px; text-align: center;">No.</th>
          <th>Notes</th>
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
