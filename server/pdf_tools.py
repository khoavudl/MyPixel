"""PDF Mini Tools & Guide Studio router for standalone PDF viewing, markup, and guide export."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import math
from pathlib import Path
import shutil
from typing import Any
import uuid

import docx
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls
from docx.shared import Inches, Pt, RGBColor
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
import pymupdf as fitz

from server.config import ARIAL_FONT_PATH, LOGO_PATH, OUT_DIR

router = APIRouter(prefix="/api/pdf_tools", tags=["pdf_tools"])

PDF_TOOLS_DIR = OUT_DIR / "pdf_tools"
PDF_TOOLS_DIR.mkdir(parents=True, exist_ok=True)

def get_unicode_font_path() -> Path | None:
    """Find a Unicode-capable TrueType font supporting Vietnamese diacritics."""
    import os
    windir = os.environ.get("WINDIR", "C:/Windows")
    candidates = [
        ARIAL_FONT_PATH,
        Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
        Path("/Library/Fonts/Arial.ttf"),
        Path(windir) / "Fonts" / "arial.ttf",
        Path(windir) / "Fonts" / "tahoma.ttf",
        Path(windir) / "Fonts" / "segoeui.ttf",
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"),
    ]
    for p in candidates:
        if p and p.is_file():
            return p
    return None

COLOR_RGB_MAP: dict[str, tuple[float, float, float]] = {
    "blue": (0.23, 0.51, 0.96),    # #3b82f6
    "red": (0.96, 0.25, 0.37),     # #f43f5e
    "green": (0.06, 0.73, 0.51),   # #10b981
    "amber": (0.96, 0.62, 0.07),   # #f59e0b
    "purple": (0.66, 0.33, 0.97),  # #a855f7
}

COLOR_HEX_MAP: dict[str, str] = {
    "blue": "3B82F6",
    "red": "F43F5E",
    "green": "10B981",
    "amber": "F59E0B",
    "purple": "A855F7",
}


class PageInfo(BaseModel):
    page_number: int
    width_pt: float
    height_pt: float
    width_mm: float
    height_mm: float


class PdfDocResponse(BaseModel):
    doc_id: str
    filename: str
    total_pages: int
    pages: list[PageInfo]


class StepBadgePayload(BaseModel):
    id: str
    step_number: int
    norm_x: float
    norm_y: float
    title: str = ""
    description: str = ""
    color: str = "blue"


class GuideShapePayload(BaseModel):
    id: str
    type: str  # 'arrow' | 'box' | 'blur' | 'text'
    color: str = "blue"
    norm_x1: float
    norm_y1: float
    norm_x2: float
    norm_y2: float
    text: str = ""
    font_size: float = 14.0
    has_fill: bool = False
    stroke_width: float = 2.0


class GuideSavePayload(BaseModel):
    doc_id: str
    badge_size: int = 28
    current_page: int = 1
    steps: list[StepBadgePayload] = []
    shapes: list[GuideShapePayload] = []
    metadata: dict[str, Any] = {}


class CropPageRequest(BaseModel):
    doc_id: str
    page_number: int = 1
    norm_x1: float
    norm_y1: float
    norm_x2: float
    norm_y2: float


class RotatePageRequest(BaseModel):
    doc_id: str
    page_number: int = 1
    angle: int = 90  # 90 degrees clockwise


class ExportFlattenedPdfRequest(BaseModel):
    doc_id: str
    current_page: int = 1
    badge_size: int = 28
    steps: list[StepBadgePayload] = []
    shapes: list[GuideShapePayload] = []


class ExportSopDocRequest(BaseModel):
    doc_id: str
    current_page: int = 1
    badge_size: int = 28
    format: str = "docx"  # 'docx' | 'pdf'
    title: str = "Visual SOP & Manual Guide"
    steps: list[StepBadgePayload] = []
    shapes: list[GuideShapePayload] = []


def draw_guide_elements_on_page(
    page: fitz.Page,
    steps: list[StepBadgePayload],
    shapes: list[GuideShapePayload],
    badge_size: int = 28,
):
    """Draw vector annotations, arrows, boxes, and screen-invariant badges onto a fitz.Page."""
    page.remove_rotation()
    rect = page.rect
    pw = rect.width
    ph = rect.height

    # 1. FIRST: Apply true permanent redactions for blur (redact) shapes
    # This physically purges underlying text glyphs, vector paths, and image pixels
    has_redactions = False
    for s in shapes:
        if s.type == "blur":
            bx1 = min(s.norm_x1, s.norm_x2) * pw
            by1 = min(s.norm_y1, s.norm_y2) * ph
            bx2 = max(s.norm_x1, s.norm_x2) * pw
            by2 = max(s.norm_y1, s.norm_y2) * ph
            box_rect = fitz.Rect(bx1, by1, bx2, by2)
            page.add_redact_annot(box_rect, fill=(0.06, 0.08, 0.12))
            has_redactions = True

    if has_redactions:
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)

    # 2. Register Unicode font for Vietnamese and international characters
    # (Must be inserted AFTER apply_redactions so font definition is not purged)
    font_path = get_unicode_font_path()
    text_fontname = "hebo"
    if font_path:
        try:
            page.insert_font(fontname="vn_unicode_font", fontfile=str(font_path))
            text_fontname = "vn_unicode_font"
        except Exception:
            text_fontname = "hebo"

    # 3. Draw remaining vector markup shapes (arrows, boxes, text notes)
    for s in shapes:
        rgb = COLOR_RGB_MAP.get(s.color, (0.23, 0.51, 0.96))
        if s.type == "arrow":
            x1 = s.norm_x1 * pw
            y1 = s.norm_y1 * ph
            x2 = s.norm_x2 * pw
            y2 = s.norm_y2 * ph
            page.draw_line(fitz.Point(x1, y1), fitz.Point(x2, y2), color=rgb, width=2.5)
            # Arrow head
            dx = x2 - x1
            dy = y2 - y1
            angle = math.atan2(dy, dx)
            arrow_len = 10.0
            tip_angle = math.pi / 6.0
            p1 = fitz.Point(
                x2 - arrow_len * math.cos(angle - tip_angle),
                y2 - arrow_len * math.sin(angle - tip_angle),
            )
            p2 = fitz.Point(
                x2 - arrow_len * math.cos(angle + tip_angle),
                y2 - arrow_len * math.sin(angle + tip_angle),
            )
            page.draw_line(fitz.Point(x2, y2), p1, color=rgb, width=2.5)
            page.draw_line(fitz.Point(x2, y2), p2, color=rgb, width=2.5)
        elif s.type == "box":
            bx1 = min(s.norm_x1, s.norm_x2) * pw
            by1 = min(s.norm_y1, s.norm_y2) * ph
            bx2 = max(s.norm_x1, s.norm_x2) * pw
            by2 = max(s.norm_y1, s.norm_y2) * ph
            box_rect = fitz.Rect(bx1, by1, bx2, by2)
            sw = max(0.5, min(20.0, getattr(s, "stroke_width", 2.0)))
            if getattr(s, "has_fill", False):
                page.draw_rect(box_rect, color=rgb, width=sw, fill=rgb, fill_opacity=0.15)
            else:
                # Default is no fill (only stroke border)
                page.draw_rect(box_rect, color=rgb, width=sw)
        elif s.type == "blur":
            # Redaction already permanently applied above
            pass
        elif s.type == "text":
            bx1 = min(s.norm_x1, s.norm_x2) * pw
            by1 = min(s.norm_y1, s.norm_y2) * ph
            bx2 = max(s.norm_x1, s.norm_x2) * pw
            by2 = max(s.norm_y1, s.norm_y2) * ph
            t_rect = fitz.Rect(bx1, by1, bx2, by2)
            page.draw_rect(t_rect, color=rgb, width=1.5, fill=(1, 1, 1), fill_opacity=0.92)
            fs = max(8.0, min(64.0, getattr(s, "font_size", 14.0)))
            content = (getattr(s, "text", "") or "").strip()
            if not content:
                content = "Note"
            # Attempt inserting text, auto-scaling down font size if it overflows
            res = page.insert_textbox(t_rect, content, fontsize=fs, color=rgb, fontname=text_fontname)
            while res < 0 and fs > 6.0:
                fs -= 1.0
                res = page.insert_textbox(t_rect, content, fontsize=fs, color=rgb, fontname=text_fontname)

    # 2. Draw step badges (scaled appropriately in pt)
    radius = max(8.0, min(36.0, badge_size * 0.55))
    for step in steps:
        rgb = COLOR_RGB_MAP.get(step.color, (0.23, 0.51, 0.96))
        cx = step.norm_x * pw
        cy = step.norm_y * ph
        # Draw background circle
        page.draw_circle(fitz.Point(cx, cy), radius, color=rgb, fill=rgb)
        # White border
        page.draw_circle(fitz.Point(cx, cy), radius, color=(1, 1, 1), width=1.5)
        # Step number text
        num_str = str(step.step_number)
        fontsize = radius * 1.15
        text_len = fitz.get_text_length(num_str, fontsize=fontsize)
        text_pt = fitz.Point(cx - text_len / 2.0, cy + fontsize * 0.35)
        page.insert_text(text_pt, num_str, fontsize=fontsize, color=(1, 1, 1), fontname="hebo")


@router.post("/upload", response_model=PdfDocResponse)
async def upload_pdf(file: UploadFile = File(...)) -> PdfDocResponse:
    """Upload a standalone PDF or image document (PNG, JPG, BMP, WEBP, TIFF) for viewing and editing."""
    filename = file.filename or "document.pdf"
    ext = Path(filename).suffix.lower()
    SUPPORTED_EXTS = {".pdf", ".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tif", ".tiff"}
    if ext not in SUPPORTED_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Supported formats: PDF, PNG, JPG, JPEG, BMP, WEBP, TIFF.",
        )

    doc_id = f"doc_{uuid.uuid4().hex[:12]}"
    doc_dir = PDF_TOOLS_DIR / doc_id
    doc_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = doc_dir / "source.pdf"

    content = await file.read()

    if ext == ".pdf":
        with open(pdf_path, "wb") as f:
            f.write(content)
        with open(doc_dir / "source_original.pdf", "wb") as f:
            f.write(content)
    else:
        # Convert image (PNG, JPG, BMP, WEBP, TIFF) into a standard 1-page PDF
        try:
            fitz_type = ext.lstrip(".")
            if fitz_type in ["jpg", "jpeg"]:
                fitz_type = "jpeg"
            img_doc = fitz.open(stream=content, filetype=fitz_type)
            pdf_bytes = img_doc.convert_to_pdf()
            img_doc.close()

            with open(pdf_path, "wb") as f:
                f.write(pdf_bytes)
            with open(doc_dir / "source_original.pdf", "wb") as f:
                f.write(pdf_bytes)
            with open(doc_dir / f"original_image{ext}", "wb") as f:
                f.write(content)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Failed to process image file: {exc}")

    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid or corrupted file: {exc}")

    total_pages = len(doc)
    if total_pages == 0:
        doc.close()
        raise HTTPException(status_code=400, detail="Document has 0 pages.")

    # Normalize rotation on all pages so coordinate system is unified
    has_rotations = any(p.rotation != 0 for p in doc)
    if has_rotations:
        for p in doc:
            p.remove_rotation()
        temp_norm = doc_dir / "temp_norm.pdf"
        doc.save(str(temp_norm))
        doc.close()
        temp_norm.replace(pdf_path)
        shutil.copyfile(pdf_path, doc_dir / "source_original.pdf")
        doc = fitz.open(pdf_path)

    pages_info: list[PageInfo] = []
    for idx, page in enumerate(doc):
        rect = page.rect
        width_pt = float(rect.width)
        height_pt = float(rect.height)
        pages_info.append(
            PageInfo(
                page_number=idx + 1,
                width_pt=round(width_pt, 2),
                height_pt=round(height_pt, 2),
                width_mm=round(width_pt * 25.4 / 72.0, 2),
                height_mm=round(height_pt * 25.4 / 72.0, 2),
            )
        )
    doc.close()

    # Pre-render page 1 at 300 DPI for high-res crisp preview
    try:
        doc = fitz.open(pdf_path)
        page1 = doc[0]
        pix = page1.get_pixmap(dpi=300)
        pix.save(str(doc_dir / "page_1_300.png"))
        doc.close()
    except Exception:
        pass

    meta = {
        "doc_id": doc_id,
        "filename": filename,
        "total_pages": total_pages,
        "pages": [p.model_dump() for p in pages_info],
    }
    with open(doc_dir / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    return PdfDocResponse(
        doc_id=doc_id,
        filename=filename,
        total_pages=total_pages,
        pages=pages_info,
    )


@router.get("/page_image/{doc_id}/{page_num}")
async def get_page_image(doc_id: str, page_num: int, dpi: int = Query(300, ge=72, le=500)):
    """Render and serve a specific page of an uploaded PDF at specified DPI (default 300 for crisp vectors)."""
    doc_dir = PDF_TOOLS_DIR / doc_id
    pdf_path = doc_dir / "source.pdf"
    if not pdf_path.is_file():
        raise HTTPException(status_code=404, detail="Document not found.")

    image_path = doc_dir / f"page_{page_num}_{dpi}.png"
    if not image_path.is_file():
        try:
            doc = fitz.open(pdf_path)
            if page_num < 1 or page_num > len(doc):
                doc.close()
                raise HTTPException(status_code=400, detail=f"Page {page_num} out of bounds.")
            page = doc[page_num - 1]
            pix = page.get_pixmap(dpi=dpi)
            pix.save(str(image_path))
            doc.close()
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to render page: {exc}")

    return FileResponse(image_path, media_type="image/png", headers={"Access-Control-Allow-Origin": "*"})


@router.get("/info/{doc_id}", response_model=PdfDocResponse)
async def get_doc_info(doc_id: str) -> PdfDocResponse:
    """Retrieve document metadata."""
    doc_dir = PDF_TOOLS_DIR / doc_id
    meta_path = doc_dir / "metadata.json"
    if not meta_path.is_file():
        raise HTTPException(status_code=404, detail="Document metadata not found.")
    with open(meta_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return PdfDocResponse(**data)


@router.post("/save_guide/{doc_id}")
async def save_guide(doc_id: str, payload: GuideSavePayload) -> dict[str, Any]:
    """Save guide draft annotations and step configurations."""
    doc_dir = PDF_TOOLS_DIR / doc_id
    if not doc_dir.is_dir():
        raise HTTPException(status_code=404, detail="Document not found.")

    guide_path = doc_dir / "guide.json"
    with open(guide_path, "w", encoding="utf-8") as f:
        json.dump(payload.model_dump(), f, indent=2, ensure_ascii=False)

    return {
        "status": "saved",
        "doc_id": doc_id,
        "step_count": len(payload.steps),
        "shape_count": len(payload.shapes),
    }


@router.get("/get_guide/{doc_id}")
async def get_guide(doc_id: str) -> dict[str, Any]:
    """Retrieve saved guide draft annotations."""
    doc_dir = PDF_TOOLS_DIR / doc_id
    guide_path = doc_dir / "guide.json"
    if not guide_path.is_file():
        return {"doc_id": doc_id, "badge_size": 28, "steps": [], "shapes": [], "current_page": 1}

    with open(guide_path, "r", encoding="utf-8") as f:
        return json.load(f)


@router.post("/crop_page")
async def crop_page_endpoint(payload: CropPageRequest) -> dict[str, Any]:
    """Crop a specific page of the PDF document to the specified normalized coordinates."""
    doc_dir = PDF_TOOLS_DIR / payload.doc_id
    pdf_path = doc_dir / "source.pdf"
    if not pdf_path.is_file():
        raise HTTPException(status_code=404, detail="Document not found.")

    try:
        doc = fitz.open(pdf_path)
        if payload.page_number < 1 or payload.page_number > len(doc):
            doc.close()
            raise HTTPException(status_code=400, detail="Page number out of bounds.")

        target_page_idx = payload.page_number - 1
        page = doc[target_page_idx]
        page.remove_rotation()
        pw = page.rect.width
        ph = page.rect.height

        min_x = max(0.0, min(payload.norm_x1, payload.norm_x2))
        min_y = max(0.0, min(payload.norm_y1, payload.norm_y2))
        max_x = min(1.0, max(payload.norm_x1, payload.norm_x2))
        max_y = min(1.0, max(payload.norm_y1, payload.norm_y2))

        crop_w = (max_x - min_x) * pw
        crop_h = (max_y - min_y) * ph
        if crop_w < 5.0 or crop_h < 5.0:
            doc.close()
            raise HTTPException(status_code=400, detail="Crop area is too small.")

        clip_rect = fitz.Rect(min_x * pw, min_y * ph, max_x * pw, max_y * ph)

        new_doc = fitz.open()
        for idx, p in enumerate(doc):
            if idx == target_page_idx:
                new_p = new_doc.new_page(width=clip_rect.width, height=clip_rect.height)
                new_p.show_pdf_page(new_p.rect, doc, idx, clip=clip_rect)
            else:
                p.remove_rotation()
                new_p = new_doc.new_page(width=p.rect.width, height=p.rect.height)
                new_p.show_pdf_page(new_p.rect, doc, idx)

        # Backup current PDF for Undo Crop
        shutil.copyfile(pdf_path, doc_dir / "crop_prev.pdf")

        temp_pdf = doc_dir / "temp_cropped.pdf"
        new_doc.save(str(temp_pdf))
        new_doc.close()
        doc.close()

        temp_pdf.replace(pdf_path)

        # Remove old cached page images
        for old_img in doc_dir.glob("page_*_*.png"):
            try:
                old_img.unlink()
            except Exception:
                pass

        # Update metadata.json with new page dimensions
        doc = fitz.open(pdf_path)
        pages_info = []
        for idx, p in enumerate(doc):
            r = p.rect
            pages_info.append(
                PageInfo(
                    page_number=idx + 1,
                    width_pt=round(float(r.width), 2),
                    height_pt=round(float(r.height), 2),
                    width_mm=round(float(r.width) * 25.4 / 72.0, 2),
                    height_mm=round(float(r.height) * 25.4 / 72.0, 2),
                ).model_dump()
            )
        doc.close()

        meta_path = doc_dir / "metadata.json"
        if meta_path.is_file():
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            meta["pages"] = pages_info
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(meta, f, indent=2)

        return {"status": "cropped", "page_number": payload.page_number, "pages": pages_info}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to crop PDF page: {exc}")


@router.post("/rotate_page")
async def rotate_page_endpoint(payload: RotatePageRequest) -> dict[str, Any]:
    """Rotate a specific page of the PDF document by specified angle (default 90 deg clockwise)."""
    doc_dir = PDF_TOOLS_DIR / payload.doc_id
    pdf_path = doc_dir / "source.pdf"
    if not pdf_path.is_file():
        raise HTTPException(status_code=404, detail="Document not found.")

    try:
        doc = fitz.open(pdf_path)
        if payload.page_number < 1 or payload.page_number > len(doc):
            doc.close()
            raise HTTPException(status_code=400, detail="Page number out of bounds.")

        target_page_idx = payload.page_number - 1
        page = doc[target_page_idx]
        page.set_rotation((page.rotation + payload.angle) % 360)
        page.remove_rotation()

        # Backup current PDF for Undo
        shutil.copyfile(pdf_path, doc_dir / "crop_prev.pdf")

        temp_pdf = doc_dir / "temp_rotated.pdf"
        doc.save(str(temp_pdf))
        doc.close()
        temp_pdf.replace(pdf_path)

        # Remove old cached page images
        for old_img in doc_dir.glob("page_*_*.png"):
            try:
                old_img.unlink()
            except Exception:
                pass

        # Update metadata.json with new page dimensions
        doc = fitz.open(pdf_path)
        pages_info = []
        for idx, p in enumerate(doc):
            r = p.rect
            pages_info.append(
                PageInfo(
                    page_number=idx + 1,
                    width_pt=round(float(r.width), 2),
                    height_pt=round(float(r.height), 2),
                    width_mm=round(float(r.width) * 25.4 / 72.0, 2),
                    height_mm=round(float(r.height) * 25.4 / 72.0, 2),
                ).model_dump()
            )
        doc.close()

        meta_path = doc_dir / "metadata.json"
        if meta_path.is_file():
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            meta["pages"] = pages_info
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(meta, f, indent=2)

        return {"status": "rotated", "page_number": payload.page_number, "pages": pages_info}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to rotate PDF page: {exc}")


@router.post("/undo_crop")
async def undo_crop_endpoint(payload: CropPageRequest) -> dict[str, Any]:
    """Revert the last crop action, restoring the previous PDF page bounding box."""
    doc_dir = PDF_TOOLS_DIR / payload.doc_id
    if not doc_dir.is_dir():
        raise HTTPException(status_code=404, detail="Document not found.")

    prev_pdf = doc_dir / "crop_prev.pdf"
    orig_pdf = doc_dir / "source_original.pdf"
    target_backup = prev_pdf if prev_pdf.is_file() else orig_pdf
    if not target_backup.is_file():
        raise HTTPException(status_code=400, detail="No previous uncropped version found to revert.")

    pdf_path = doc_dir / "source.pdf"
    shutil.copyfile(target_backup, pdf_path)
    if prev_pdf.is_file():
        try:
            prev_pdf.unlink()
        except Exception:
            pass

    # Clear cached page images
    for old_img in doc_dir.glob("page_*_*.png"):
        try:
            old_img.unlink()
        except Exception:
            pass

    # Read updated pages
    doc = fitz.open(pdf_path)
    pages_info = []
    for idx, p in enumerate(doc):
        r = p.rect
        pages_info.append(
            PageInfo(
                page_number=idx + 1,
                width_pt=round(float(r.width), 2),
                height_pt=round(float(r.height), 2),
                width_mm=round(float(r.width) * 25.4 / 72.0, 2),
                height_mm=round(float(r.height) * 25.4 / 72.0, 2),
            ).model_dump()
        )
    doc.close()

    meta_path = doc_dir / "metadata.json"
    if meta_path.is_file():
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        meta["pages"] = pages_info
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

    return {"status": "reverted", "page_number": payload.page_number, "pages": pages_info}


@router.post("/export_flattened_pdf")
async def export_flattened_pdf(payload: ExportFlattenedPdfRequest) -> FileResponse:
    """Export the PDF document with all step badges, arrows, and boxes vector-embedded."""
    doc_dir = PDF_TOOLS_DIR / payload.doc_id
    pdf_path = doc_dir / "source.pdf"
    if not pdf_path.is_file():
        raise HTTPException(status_code=404, detail="Source document not found.")

    output_pdf_path = doc_dir / f"guide_p{payload.current_page}_flattened.pdf"

    try:
        doc = fitz.open(pdf_path)
        if payload.current_page < 1 or payload.current_page > len(doc):
            doc.close()
            raise HTTPException(status_code=400, detail="Page number out of bounds.")

        page = doc[payload.current_page - 1]
        draw_guide_elements_on_page(
            page=page,
            steps=payload.steps,
            shapes=payload.shapes,
            badge_size=payload.badge_size,
        )

        doc.save(str(output_pdf_path))
        doc.close()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate flattened PDF: {exc}")

    return FileResponse(
        output_pdf_path,
        filename=output_pdf_path.name,
        media_type="application/pdf",
    )


@router.post("/export_sop_doc")
async def export_sop_doc(payload: ExportSopDocRequest) -> FileResponse:
    """Generate professional Visual SOP Report (DOCX / PDF) with marked overview image & step table."""
    doc_dir = PDF_TOOLS_DIR / payload.doc_id
    pdf_path = doc_dir / "source.pdf"
    if not pdf_path.is_file():
        raise HTTPException(status_code=404, detail="Source document not found.")

    # 1. Render annotated page to high-res PNG overview
    overview_img_path = doc_dir / f"sop_overview_p{payload.current_page}.png"
    try:
        doc = fitz.open(pdf_path)
        page = doc[payload.current_page - 1]
        draw_guide_elements_on_page(
            page=page,
            steps=payload.steps,
            shapes=payload.shapes,
            badge_size=payload.badge_size,
        )
        pix = page.get_pixmap(dpi=200)
        pix.save(str(overview_img_path))
        doc.close()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to render guide overview: {exc}")

    # Read original filename from metadata if available
    filename = "document.pdf"
    meta_path = doc_dir / "metadata.json"
    if meta_path.is_file():
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
                filename = meta.get("filename", filename)
        except Exception:
            pass

    # If user wants PDF format, return the vector flattened PDF
    if payload.format.lower() == "pdf":
        flat_req = ExportFlattenedPdfRequest(
            doc_id=payload.doc_id,
            current_page=payload.current_page,
            badge_size=payload.badge_size,
            steps=payload.steps,
            shapes=payload.shapes,
        )
        return await export_flattened_pdf(flat_req)

    # 2. Generate DOCX format
    docx_path = doc_dir / f"SOP_Guide_p{payload.current_page}.docx"
    document = docx.Document()

    # Set page margins (0.75 in)
    for section in document.sections:
        section.top_margin = Inches(0.75)
        section.bottom_margin = Inches(0.75)
        section.left_margin = Inches(0.75)
        section.right_margin = Inches(0.75)

    # Header with title & logo
    header_para = document.add_paragraph()
    header_para.alignment = WD_ALIGN_PARAGRAPH.LEFT
    title_run = header_para.add_run("VISUAL SOP & MANUAL GUIDE\n")
    title_run.font.name = "Arial"
    title_run.font.size = Pt(18)
    title_run.font.bold = True
    title_run.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)

    sub_run = header_para.add_run(f"Document: {filename} • Page {payload.current_page}")
    sub_run.font.name = "Arial"
    sub_run.font.size = Pt(10)
    sub_run.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    # Metadata summary
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    meta_table = document.add_table(rows=2, cols=3)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_table.autofit = True

    cells_meta = [
        ("File Name", filename),
        ("Target Page", f"Page {payload.current_page}"),
        ("Created At", now_str),
        ("Total Steps", f"{len(payload.steps)} Action Steps"),
        ("Markups", f"{len(payload.shapes)} Shapes / Redactions"),
        ("Generator", "MyPixel Editor Toolbox"),
    ]
    for idx, (label, val) in enumerate(cells_meta):
        row_idx = idx // 3
        col_idx = idx % 3
        c = meta_table.cell(row_idx, col_idx)
        p = c.paragraphs[0]
        r1 = p.add_run(f"{label}: ")
        r1.font.bold = True
        r1.font.size = Pt(9)
        r2 = p.add_run(val)
        r2.font.size = Pt(9)

    document.add_paragraph()  # spacer

    # Section 1: Overview Image
    sec1 = document.add_paragraph()
    r_sec1 = sec1.add_run("1. VISUAL OVERVIEW")
    r_sec1.font.bold = True
    r_sec1.font.size = Pt(12)
    r_sec1.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)

    if overview_img_path.is_file():
        document.add_picture(str(overview_img_path), width=Inches(6.5))

    document.add_paragraph()  # spacer

    # Section 2: Step-by-Step Instructions Table
    sec2 = document.add_paragraph()
    r_sec2 = sec2.add_run("2. STEP-BY-STEP ACTION INSTRUCTIONS")
    r_sec2.font.bold = True
    r_sec2.font.size = Pt(12)
    r_sec2.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)

    if payload.steps:
        table = document.add_table(rows=1, cols=4)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        headers = ["Step #", "Category", "Step Title", "Action / Inspection Details"]
        hdr_cells = table.rows[0].cells
        for i, text in enumerate(headers):
            hdr_cells[i].text = text
            shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="1E293B"/>')
            hdr_cells[i]._tc.get_or_add_tcPr().append(shd)
            for p in hdr_cells[i].paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for run in p.runs:
                    run.font.bold = True
                    run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                    run.font.size = Pt(9)

        # Set specific column widths
        col_widths = [Inches(0.8), Inches(1.1), Inches(1.8), Inches(2.8)]

        for s in payload.steps:
            row_cells = table.add_row().cells
            row_cells[0].text = str(s.step_number)
            row_cells[0].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            row_cells[0].paragraphs[0].runs[0].font.bold = True

            # Category tag
            tag_name = s.color.upper()
            row_cells[1].text = tag_name
            row_cells[1].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            hex_color = COLOR_HEX_MAP.get(s.color, "3B82F6")
            shd_tag = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
            row_cells[1]._tc.get_or_add_tcPr().append(shd_tag)
            for r in row_cells[1].paragraphs[0].runs:
                r.font.bold = True
                r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                r.font.size = Pt(8)

            # Title
            row_cells[2].text = s.title
            row_cells[2].paragraphs[0].runs[0].font.bold = True

            # Description
            row_cells[3].text = s.description or "No additional notes provided."

            for i, w in enumerate(col_widths):
                row_cells[i].width = w

    else:
        document.add_paragraph("No action steps were stamped for this page.")

    document.save(str(docx_path))

    return FileResponse(
        docx_path,
        filename=docx_path.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
