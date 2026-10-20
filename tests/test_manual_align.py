"""Tests for Mode 3: Manual Interactive Alignment Engine and API endpoints."""

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
def test_pdfs(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("manual_align_pdfs")
    p1 = tmp / "brand_box.pdf"
    p2 = tmp / "vendor_box.pdf"
    # Build a 140x110 mm brand page with a 100x80 frame
    build_pdf(p1, text_line1="BRAND LABEL", page_w_mm=140, page_h_mm=110, frame_w_mm=100, frame_h_mm=80)
    # Build a vendor page
    build_pdf(p2, text_line1="VENDOR LABEL", page_w_mm=140, page_h_mm=110, frame_w_mm=100, frame_h_mm=80)
    return p1, p2


def test_prepare_manual_align_upload(client, test_pdfs):
    brand_pdf, vendor_pdf = test_pdfs

    with open(brand_pdf, "rb") as fb, open(vendor_pdf, "rb") as fv:
        response = client.post(
            "/api/manual_align/prepare",
            data={"brand_page": "1", "vendor_page": "1"},
            files={
                "brand_file": ("brand.pdf", fb, "application/pdf"),
                "vendor_file": ("vendor.pdf", fv, "application/pdf"),
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert "run_id" in data
    assert data["brand_image"].endswith("preview_brand.png")
    assert data["vendor_image"].endswith("preview_vendor.png")
    assert len(data["brand_size_mm"]) == 2
    assert len(data["vendor_size_mm"]) == 2
    assert data["brand_size_mm"][0] > 100
    assert data["vendor_size_mm"][0] > 100
    assert len(data["initial_crop_bbox_mm"]) == 4

    run_id = data["run_id"]

    # Verify preview images can be downloaded
    img_resp = client.get(data["brand_image"])
    assert img_resp.status_code == 200
    assert "image/png" in img_resp.headers["content-type"]

    # Test preparing from existing run id
    get_resp = client.get(f"/api/manual_align/prepare/{run_id}")
    assert get_resp.status_code == 200
    get_data = get_resp.json()
    assert get_data["run_id"] == run_id


def test_apply_manual_align(client, test_pdfs):
    brand_pdf, vendor_pdf = test_pdfs

    # 1. Prepare session
    with open(brand_pdf, "rb") as fb, open(vendor_pdf, "rb") as fv:
        prep_res = client.post(
            "/api/manual_align/prepare",
            files={
                "brand_file": ("brand.pdf", fb, "application/pdf"),
                "vendor_file": ("vendor.pdf", fv, "application/pdf"),
            },
        )
    assert prep_res.status_code == 200
    run_id = prep_res.json()["run_id"]

    # 2. Apply alignment transform
    payload = {
        "run_id": run_id,
        "transform": {
            "offset_x_mm": 5.0,
            "offset_y_mm": 3.0,
            "scale_x": 1.02,
            "scale_y": 1.02,
            "rotation_deg": 0.5,
        },
        "crop_bbox_mm": [10.0, 10.0, 100.0, 80.0],
        "brand_page": 1,
        "vendor_page": 1,
    }

    apply_res = client.post("/api/manual_align/apply", json=payload)
    assert apply_res.status_code == 200
    result = apply_res.json()

    assert result["run_id"] == run_id
    assert result["status"] == "PASS"
    assert result["exit_code"] == 0

    images = result["images"]
    assert images["brand_cropped"] is not None
    assert images["vendor_cropped"] is not None
    assert images["overlay"] is not None
    assert images["absdiff_heatmap"] is not None

    # 3. Check image files can be served
    for key, path in images.items():
        if path:
            r = client.get(path)
            assert r.status_code == 200
            assert "image/png" in r.headers["content-type"]

    # 4. Check run status and report
    status_res = client.get(f"/api/runs/{run_id}")
    assert status_res.status_code == 200
    st_data = status_res.json()
    assert st_data["status"] == "PASS"
    assert st_data["report"]["mode"] == "manual_align"
    assert "manual_transform" in st_data["report"]


def test_brand_vendor_order_preserved_when_alphabetically_inverted(client, tmp_path):
    # Vendor filename starts with 'a_', Brand filename starts with 'z_'
    p_vendor = tmp_path / "a_vendor.pdf"
    p_brand = tmp_path / "z_brand.pdf"
    build_pdf(p_brand, text_line1="BRAND 200", page_w_mm=200, page_h_mm=150)
    build_pdf(p_vendor, text_line1="VENDOR 100", page_w_mm=100, page_h_mm=80)

    with open(p_brand, "rb") as fb, open(p_vendor, "rb") as fv:
        prep_res = client.post(
            "/api/manual_align/prepare",
            files={
                "brand_file": ("z_brand.pdf", fb, "application/pdf"),
                "vendor_file": ("a_vendor.pdf", fv, "application/pdf"),
            },
        )
    assert prep_res.status_code == 200
    data = prep_res.json()
    run_id = data["run_id"]
    # Verify Brand is 200mm, Vendor is 100mm
    assert round(data["brand_size_mm"][0]) == 200
    assert round(data["vendor_size_mm"][0]) == 100

    # Apply alignment
    payload = {
        "run_id": run_id,
        "transform": {
            "offset_x_mm": 10.0,
            "offset_y_mm": 10.0,
            "scale_x": 0.5,
            "scale_y": 0.5,
            "rotation_deg": 0.0,
        },
        "crop_bbox_mm": [0.0, 0.0, 200.0, 150.0],
    }
    apply_res = client.post("/api/manual_align/apply", json=payload)
    assert apply_res.status_code == 200
    res_data = apply_res.json()

    # Verify report keeps Brand as z_brand and Vendor as a_vendor
    rep = res_data["report"]
    assert "z_brand" in rep["inputs"]["brand"]["pdf_path"]
    assert "a_vendor" in rep["inputs"]["vendor"]["pdf_path"]
    assert round(rep["inputs"]["brand"]["page_size_mm"][0]) == 200
    assert round(rep["inputs"]["vendor"]["page_size_mm"][0]) == 100


def test_realign_from_existing_manual_run(client, test_pdfs):
    """Test re-entering manual alignment from 4-way workspace preserves transforms."""
    brand_pdf, vendor_pdf = test_pdfs

    # 1. Initial prepare
    with open(brand_pdf, "rb") as fb, open(vendor_pdf, "rb") as fv:
        prep_res = client.post(
            "/api/manual_align/prepare",
            files={
                "brand_file": ("brand.pdf", fb, "application/pdf"),
                "vendor_file": ("vendor.pdf", fv, "application/pdf"),
            },
        )
    assert prep_res.status_code == 200
    run_id = prep_res.json()["run_id"]

    # 2. First apply alignment with specific values
    payload1 = {
        "run_id": run_id,
        "transform": {
            "offset_x_mm": 12.34,
            "offset_y_mm": 5.67,
            "scale_x": 1.05,
            "scale_y": 1.05,
            "rotation_deg": 1.5,
        },
        "crop_bbox_mm": [5.0, 5.0, 95.0, 75.0],
    }
    apply_res1 = client.post("/api/manual_align/apply", json=payload1)
    assert apply_res1.status_code == 200

    # 3. User navigates back to manual align: GET /api/manual_align/prepare/{run_id}
    reenter_res = client.get(f"/api/manual_align/prepare/{run_id}")
    assert reenter_res.status_code == 200
    reenter_data = reenter_res.json()

    # Verify initial_transform is populated with exact previous values
    init_tr = reenter_data.get("initial_transform")
    assert init_tr is not None
    assert round(init_tr["offset_x_mm"], 2) == 12.34
    assert round(init_tr["offset_y_mm"], 2) == 5.67
    assert round(init_tr["scale_x"], 2) == 1.05
    assert round(init_tr["rotation_deg"], 1) == 1.5
    assert round(reenter_data["initial_crop_bbox_mm"][0], 1) == 5.0
    assert round(reenter_data["initial_crop_bbox_mm"][1], 1) == 5.0

    # 4. Apply a micro-adjustment (second apply)
    payload2 = {
        "run_id": run_id,
        "transform": {
            "offset_x_mm": 12.84,  # shifted +0.5 mm
            "offset_y_mm": 5.67,
            "scale_x": 1.05,
            "scale_y": 1.05,
            "rotation_deg": 1.5,
        },
        "crop_bbox_mm": [5.0, 5.0, 95.0, 75.0],
    }
    apply_res2 = client.post("/api/manual_align/apply", json=payload2)
    assert apply_res2.status_code == 200
    status2 = apply_res2.json()
    assert round(status2["report"]["manual_transform"]["offset_x_mm"], 2) == 12.84


def test_inherit_auto_crop_alignment_when_switching_to_manual(client, test_pdfs):
    """Test switching from AutoCrop compare mode to manual align inherits auto alignment."""
    brand_pdf, vendor_pdf = test_pdfs

    # 1. Run automated AutoCrop compare
    with open(brand_pdf, "rb") as fb, open(vendor_pdf, "rb") as fv:
        analyze_res = client.post(
            "/api/analyze",
            data={"target_size_mm": "100x80", "brand_page": "1", "vendor_page": "1"},
            files={
                "brand_file": ("brand.pdf", fb, "application/pdf"),
                "vendor_file": ("vendor.pdf", fv, "application/pdf"),
            },
        )
    assert analyze_res.status_code == 200
    run_id = analyze_res.json()["run_id"]

    # Wait for pipeline to finish
    with client.websocket_connect(f"/ws/runs/{run_id}") as ws:
        for _ in range(30):
            msg = ws.receive_json()
            if msg.get("type") in ("complete", "error"):
                break

    status_res = client.get(f"/api/runs/{run_id}")
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "PASS"

    # 2. User in 4-way workspace clicks "Adjust Alignment" -> calls prepare endpoint
    prep_res = client.get(f"/api/manual_align/prepare/{run_id}")
    assert prep_res.status_code == 200
    prep_data = prep_res.json()

    # 3. Verify initial_transform is inherited from auto-alignment (NOT None, NOT 0)
    init_tr = prep_data.get("initial_transform")
    assert init_tr is not None, "initial_transform must be inherited from AutoCrop run"
    assert "offset_x_mm" in init_tr
    assert "offset_y_mm" in init_tr
    assert "scale_x" in init_tr
    assert round(init_tr["scale_x"], 1) == 1.0  # scale is ~1.0
    assert len(prep_data["initial_crop_bbox_mm"]) == 4
    # Crop box width should be ~100 mm and height ~80 mm
    assert round(prep_data["initial_crop_bbox_mm"][2], 0) == 100.0
    assert round(prep_data["initial_crop_bbox_mm"][3], 0) == 80.0

    # 4. User applies micro-nudge (+0.1 mm) from inherited position
    micro_nudged_x = init_tr["offset_x_mm"] + 0.1
    payload = {
        "run_id": run_id,
        "transform": {
            **init_tr,
            "offset_x_mm": micro_nudged_x,
        },
        "crop_bbox_mm": prep_data["initial_crop_bbox_mm"],
    }
    apply_res = client.post("/api/manual_align/apply", json=payload)
    assert apply_res.status_code == 200
    apply_data = apply_res.json()
    assert apply_data["status"] == "PASS"
    assert round(apply_data["report"]["manual_transform"]["offset_x_mm"], 4) == round(micro_nudged_x, 4)



