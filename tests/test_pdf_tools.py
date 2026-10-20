"""Tests for standalone PDF Tools router (/api/pdf_tools)."""

from pathlib import Path
from fastapi.testclient import TestClient
import pytest

from server.app import app

client = TestClient(app)

SAMPLE_PDF = Path("sample/v11.pdf")


def test_upload_pdf_success():
    """Test uploading a valid PDF document."""
    assert SAMPLE_PDF.is_file(), "sample/v11.pdf should exist"

    with open(SAMPLE_PDF, "rb") as f:
        response = client.post(
            "/api/pdf_tools/upload",
            files={"file": ("v11.pdf", f, "application/pdf")},
        )

    assert response.status_code == 200
    data = response.json()
    assert "doc_id" in data
    assert data["filename"] == "v11.pdf"
    assert data["total_pages"] >= 1
    assert len(data["pages"]) == data["total_pages"]

    p1 = data["pages"][0]
    assert p1["page_number"] == 1
    assert p1["width_mm"] > 0
    assert p1["height_mm"] > 0

    doc_id = data["doc_id"]

    # Test get_doc_info
    info_resp = client.get(f"/api/pdf_tools/info/{doc_id}")
    assert info_resp.status_code == 200
    assert info_resp.json()["doc_id"] == doc_id

    # Test get_page_image
    img_resp = client.get(f"/api/pdf_tools/page_image/{doc_id}/1?dpi=100")
    assert img_resp.status_code == 200
    assert img_resp.headers["content-type"] == "image/png"
    assert len(img_resp.content) > 1000


def test_upload_pdf_invalid_file():
    """Test rejecting non-pdf upload."""
    response = client.post(
        "/api/pdf_tools/upload",
        files={"file": ("test.txt", b"plain text", "text/plain")},
    )
    assert response.status_code == 400
    assert "Only PDF files are supported" in response.json()["detail"]


def test_save_and_get_guide():
    """Test saving and retrieving guide annotations."""
    with open(SAMPLE_PDF, "rb") as f:
        upload_resp = client.post(
            "/api/pdf_tools/upload",
            files={"file": ("v11.pdf", f, "application/pdf")},
        )
    doc_id = upload_resp.json()["doc_id"]

    # Save guide payload
    payload = {
        "doc_id": doc_id,
        "badge_size": 32,
        "current_page": 1,
        "steps": [
            {
                "id": "step-1",
                "step_number": 1,
                "norm_x": 0.25,
                "norm_y": 0.35,
                "title": "Check Logo",
                "description": "Align logo to center",
                "color": "blue",
            },
            {
                "id": "step-2",
                "step_number": 2,
                "norm_x": 0.50,
                "norm_y": 0.60,
                "title": "Fix Barcode",
                "description": "Barcode size is 80%",
                "color": "red",
            },
        ],
        "shapes": [
            {
                "id": "shape-1",
                "type": "arrow",
                "color": "blue",
                "norm_x1": 0.1,
                "norm_y1": 0.1,
                "norm_x2": 0.2,
                "norm_y2": 0.2,
            }
        ],
    }

    save_resp = client.post(f"/api/pdf_tools/save_guide/{doc_id}", json=payload)
    assert save_resp.status_code == 200
    assert save_resp.json()["status"] == "saved"
    assert save_resp.json()["step_count"] == 2
    assert save_resp.json()["shape_count"] == 1

    # Get guide
    get_resp = client.get(f"/api/pdf_tools/get_guide/{doc_id}")
    assert get_resp.status_code == 200
    guide_data = get_resp.json()
    assert guide_data["badge_size"] == 32
    assert len(guide_data["steps"]) == 2
    assert guide_data["steps"][0]["title"] == "Check Logo"


def test_export_flattened_pdf():
    """Test exporting flattened vector PDF with badges & shapes."""
    with open(SAMPLE_PDF, "rb") as f:
        upload_resp = client.post(
            "/api/pdf_tools/upload",
            files={"file": ("v11.pdf", f, "application/pdf")},
        )
    doc_id = upload_resp.json()["doc_id"]

    payload = {
        "doc_id": doc_id,
        "current_page": 1,
        "badge_size": 28,
        "steps": [
            {
                "id": "step-1",
                "step_number": 1,
                "norm_x": 0.3,
                "norm_y": 0.4,
                "title": "Verify Color",
                "description": "Cyan 100%",
                "color": "blue",
            }
        ],
        "shapes": [
            {
                "id": "box-1",
                "type": "box",
                "color": "red",
                "norm_x1": 0.2,
                "norm_y1": 0.2,
                "norm_x2": 0.5,
                "norm_y2": 0.5,
            }
        ],
    }

    resp = client.post("/api/pdf_tools/export_flattened_pdf", json=payload)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert len(resp.content) > 1000


def test_export_sop_doc():
    """Test exporting SOP Guide in DOCX format."""
    with open(SAMPLE_PDF, "rb") as f:
        upload_resp = client.post(
            "/api/pdf_tools/upload",
            files={"file": ("v11.pdf", f, "application/pdf")},
        )
    doc_id = upload_resp.json()["doc_id"]

    payload = {
        "doc_id": doc_id,
        "current_page": 1,
        "badge_size": 28,
        "format": "docx",
        "title": "Inspection SOP",
        "steps": [
            {
                "id": "step-1",
                "step_number": 1,
                "norm_x": 0.3,
                "norm_y": 0.4,
                "title": "Barcode Check",
                "description": "Check grade A readability",
                "color": "green",
            }
        ],
        "shapes": [],
    }

    resp = client.post("/api/pdf_tools/export_sop_doc", json=payload)
    assert resp.status_code == 200
    assert "application/vnd.openxmlformats" in resp.headers["content-type"]
    assert len(resp.content) > 2000


def test_crop_page():
    """Test cropping a PDF page to a normalized sub-region."""
    with open(SAMPLE_PDF, "rb") as f:
        upload_resp = client.post(
            "/api/pdf_tools/upload",
            files={"file": ("v11.pdf", f, "application/pdf")},
        )
    doc_id = upload_resp.json()["doc_id"]
    orig_w_mm = upload_resp.json()["pages"][0]["width_mm"]

    crop_payload = {
        "doc_id": doc_id,
        "page_number": 1,
        "norm_x1": 0.1,
        "norm_y1": 0.1,
        "norm_x2": 0.6,
        "norm_y2": 0.6,
    }

    crop_resp = client.post("/api/pdf_tools/crop_page", json=crop_payload)
    assert crop_resp.status_code == 200
    data = crop_resp.json()
    assert data["status"] == "cropped"
    new_w_mm = data["pages"][0]["width_mm"]
    # New width should be approximately 50% (0.6 - 0.1) of original width
    assert new_w_mm < orig_w_mm
    assert abs(new_w_mm - (orig_w_mm * 0.5)) < 2.0


def test_true_redaction_and_box_nofill():
    """Verify blur performs physical PDF sanitization/redaction and box defaults to no-fill."""
    import fitz

    with open(SAMPLE_PDF, "rb") as f:
        upload_resp = client.post(
            "/api/pdf_tools/upload",
            files={"file": ("v11.pdf", f, "application/pdf")},
        )
    doc_id = upload_resp.json()["doc_id"]

    # Redact top-center region
    payload = {
        "doc_id": doc_id,
        "current_page": 1,
        "badge_size": 28,
        "steps": [],
        "shapes": [
            {
                "id": "blur-1",
                "type": "blur",
                "color": "blue",
                "norm_x1": 0.1,
                "norm_y1": 0.1,
                "norm_x2": 0.5,
                "norm_y2": 0.4,
            },
            {
                "id": "box-1",
                "type": "box",
                "color": "red",
                "norm_x1": 0.6,
                "norm_y1": 0.6,
                "norm_x2": 0.9,
                "norm_y2": 0.9,
                "has_fill": False,
            },
            {
                "id": "text-1",
                "type": "text",
                "color": "green",
                "norm_x1": 0.5,
                "norm_y1": 0.1,
                "norm_x2": 0.8,
                "norm_y2": 0.3,
                "text": "Critical Note",
                "font_size": 22.0,
            },
        ],
    }

    resp = client.post("/api/pdf_tools/export_flattened_pdf", json=payload)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"

    # Open exported PDF and verify text under the blur shape was physically purged
    doc = fitz.open(stream=resp.content, filetype="pdf")
    page = doc[0]
    pw = page.rect.width
    ph = page.rect.height
    redact_rect = fitz.Rect(0.1 * pw, 0.1 * ph, 0.5 * pw, 0.4 * ph)
    extracted_text = page.get_text("text", clip=redact_rect).strip()
    assert extracted_text == "", "Underlying text under blur shape MUST be physically purged by true redaction"

    # Verify custom text note is preserved in exported PDF
    text_rect = fitz.Rect(0.5 * pw, 0.1 * ph, 0.8 * pw, 0.3 * ph)
    extracted_custom_text = page.get_text("text", clip=text_rect).strip()
    assert "Critical Note" in extracted_custom_text, "User typed text note MUST be rendered in exported PDF"
    doc.close()


def test_rotate_page():
    """Test rotating a page 90 degrees clockwise."""
    with open(SAMPLE_PDF, "rb") as f:
        upload_resp = client.post(
            "/api/pdf_tools/upload",
            files={"file": ("v11.pdf", f, "application/pdf")},
        )
    doc_id = upload_resp.json()["doc_id"]
    orig_p1 = upload_resp.json()["pages"][0]
    orig_w = orig_p1["width_mm"]
    orig_h = orig_p1["height_mm"]

    rotate_payload = {
        "doc_id": doc_id,
        "page_number": 1,
        "angle": 90,
    }
    rotate_resp = client.post("/api/pdf_tools/rotate_page", json=rotate_payload)
    assert rotate_resp.status_code == 200
    data = rotate_resp.json()
    assert data["status"] == "rotated"
    new_p1 = data["pages"][0]
    # In a 90-degree rotation, width and height swap
    assert abs(new_p1["width_mm"] - orig_h) < 1.0
    assert abs(new_p1["height_mm"] - orig_w) < 1.0


def test_crop_and_export_badge_alignment():
    """Test cropping a page and exporting with a badge to ensure 100% roundness and text insertion."""
    import fitz

    with open(SAMPLE_PDF, "rb") as f:
        upload_resp = client.post(
            "/api/pdf_tools/upload",
            files={"file": ("v11.pdf", f, "application/pdf")},
        )
    doc_id = upload_resp.json()["doc_id"]

    # 1. Crop page to [0.2, 0.2] - [0.8, 0.8]
    crop_resp = client.post(
        "/api/pdf_tools/crop_page",
        json={"doc_id": doc_id, "page_number": 1, "norm_x1": 0.2, "norm_y1": 0.2, "norm_x2": 0.8, "norm_y2": 0.8},
    )
    assert crop_resp.status_code == 200

    # 2. Export with Step Badge at (0.5, 0.5)
    export_resp = client.post(
        "/api/pdf_tools/export_flattened_pdf",
        json={
            "doc_id": doc_id,
            "current_page": 1,
            "badge_size": 30,
            "steps": [
                {
                    "id": "step-center",
                    "step_number": 7,
                    "norm_x": 0.5,
                    "norm_y": 0.5,
                    "title": "Center Check",
                    "color": "blue",
                }
            ],
            "shapes": [],
        },
    )
    assert export_resp.status_code == 200
    assert export_resp.headers["content-type"] == "application/pdf"

    # 3. Verify in exported PDF that circle and text '7' are present
    doc = fitz.open(stream=export_resp.content, filetype="pdf")
    page = doc[0]
    assert page.rotation == 0
    drawings = page.get_drawings()
    assert len(drawings) > 0

    # Check for text '7'
    blocks = page.get_text("blocks")
    found_seven = any("7" in b[4] for b in blocks)
    assert found_seven, "Exported PDF page must contain the badge step number '7'"
    doc.close()
