"""Unit and integration tests for FastAPI backend server (Milestone 2A.1)."""

import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from server.app import app
from tests.synth.make_synthetic import build_pdf


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def sample_pdfs(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("server_pdfs")
    p1 = tmp / "brand.pdf"
    p2 = tmp / "vendor.pdf"
    build_pdf(p1, text_line1="BRAND ARTWORK", page_w_mm=120, page_h_mm=100, frame_w_mm=100, frame_h_mm=80)
    build_pdf(p2, text_line1="BRAND ARTWORK", page_w_mm=120, page_h_mm=100, frame_w_mm=100, frame_h_mm=80)
    return p1, p2


def test_health_check(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_analyze_and_websocket_stream(client, sample_pdfs):
    brand_pdf, vendor_pdf = sample_pdfs

    # 1. Trigger analyze via multipart POST
    with open(brand_pdf, "rb") as f_brand, open(vendor_pdf, "rb") as f_vendor:
        response = client.post(
            "/api/analyze",
            data={"target_size_mm": "100x80", "brand_page": "1", "vendor_page": "1"},
            files={
                "brand_file": ("brand.pdf", f_brand, "application/pdf"),
                "vendor_file": ("vendor.pdf", f_vendor, "application/pdf"),
            },
        )
    assert response.status_code == 200
    res_data = response.json()
    assert "run_id" in res_data
    run_id = res_data["run_id"]
    assert res_data["status"] == "STARTING"

    # 2. Connect WebSocket to stream logs
    received_logs = []
    with client.websocket_connect(f"/ws/runs/{run_id}") as ws:
        # Receive log events until "complete" or "error"
        for _ in range(30):
            data = ws.receive_json()
            received_logs.append(data)
            if data.get("type") in ("complete", "error"):
                break

    assert len(received_logs) >= 5, f"Expected multiple log steps, got: {len(received_logs)}"
    event_types = [l.get("type") for l in received_logs]
    assert "step_start" in event_types or "step_end" in event_types
    assert "complete" in event_types

    # 3. Check run status via REST
    status_res = client.get(f"/api/runs/{run_id}")
    assert status_res.status_code == 200
    status_data = status_res.json()
    assert status_data["run_id"] == run_id
    assert status_data["status"] == "PASS"
    assert status_data["images"]["brand_cropped"] is not None

    # 4. Check fetching image
    img_url = status_data["images"]["brand_cropped"]
    img_res = client.get(img_url)
    assert img_res.status_code == 200
    assert img_res.headers["content-type"] in ("image/png", "application/octet-stream")


def test_annotations_crud_and_export(client, sample_pdfs):
    brand_pdf, vendor_pdf = sample_pdfs

    # Trigger a quick analyze
    with open(brand_pdf, "rb") as f_brand, open(vendor_pdf, "rb") as f_vendor:
        res = client.post(
            "/api/analyze",
            data={"target_size_mm": "100x80"},
            files={
                "brand_file": ("brand.pdf", f_brand, "application/pdf"),
                "vendor_file": ("vendor.pdf", f_vendor, "application/pdf"),
            },
        )
    run_id = res.json()["run_id"]

    # Save annotations
    sample_annotations = [
        {
            "id": "box-1",
            "norm_x": 0.15,
            "norm_y": 0.20,
            "norm_w": 0.10,
            "norm_h": 0.05,
            "bbox_mm": [15.0, 16.0, 10.0, 4.0],
            "tag": "missing_char",
            "severity": "critical",
            "note": "Mất dấu tiếng Việt",
            "created_at": "2026-10-13T10:00:00Z",
        }
    ]
    save_res = client.post(
        f"/api/runs/{run_id}/annotations",
        json={"run_id": run_id, "annotations": sample_annotations},
    )
    assert save_res.status_code == 200

    # Get annotations
    get_res = client.get(f"/api/runs/{run_id}/annotations")
    assert get_res.status_code == 200
    anns = get_res.json()
    assert len(anns) == 1
    assert anns[0]["id"] == "box-1"
    assert anns[0]["note"] == "Mất dấu tiếng Việt"

    # Export report (HTML)
    export_res = client.post(
        "/api/export",
        json={"run_id": run_id, "format": "html"},
    )
    assert export_res.status_code == 200
    assert "text/html" in export_res.headers["content-type"]
    assert "BIÊN BẢN KIỂM ĐỊNH BAO BÌ" in export_res.text
    assert "Mất dấu tiếng Việt" in export_res.text
