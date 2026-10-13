"""Unit and integration tests for artdiff.eval (Task 1)."""

import json
from pathlib import Path
import pytest

from artdiff.eval.eval import box_iou, evaluate_diff, evaluate_files, is_center_inside


def test_box_iou():
    # Identical boxes
    b1 = [10.0, 10.0, 20.0, 20.0]
    assert box_iou(b1, b1) == pytest.approx(1.0)

    # Disjoint boxes
    b2 = [40.0, 40.0, 10.0, 10.0]
    assert box_iou(b1, b2) == 0.0

    # 50% overlap in x and y -> (10*10) / (400 + 400 - 100) = 100 / 700 = 1/7
    b3 = [20.0, 20.0, 20.0, 20.0]
    assert box_iou(b1, b3) == pytest.approx(100.0 / 700.0)


def test_is_center_inside():
    outer = [10.0, 10.0, 40.0, 40.0]
    # Center of inner is at (20, 20) -> inside outer [10..50, 10..50]
    inner_in = [18.0, 18.0, 4.0, 4.0]
    assert is_center_inside(inner_in, outer) is True

    # Center of inner is at (60, 20) -> outside outer
    inner_out = [58.0, 18.0, 4.0, 4.0]
    assert is_center_inside(inner_out, outer) is False


def test_evaluate_empty_truth():
    # Case with no truth and no predictions
    res = evaluate_diff([], [])
    assert res["recall"] == 1.0
    assert res["false_positives"] == 0
    assert res["kind_accuracy"] == 1.0

    # Case with no truth but false positive predictions
    preds = [{"id": 1, "bbox_mm": [10.0, 10.0, 5.0, 5.0], "kind": "content"}]
    res2 = evaluate_diff(preds, [])
    assert res2["recall"] == 1.0
    assert res2["false_positives"] == 1


def test_evaluate_perfect_match():
    truth = [
        {"id": 1, "bbox_mm": [10.0, 10.0, 5.0, 5.0], "expected_kind": "content"},
        {"id": 2, "bbox_mm": [30.0, 30.0, 20.0, 20.0], "expected_kind": "shift_only"},
    ]
    preds = [
        {"id": 101, "bbox_mm": [10.0, 10.0, 5.0, 5.0], "kind": "content"},
        {"id": 102, "bbox_mm": [30.0, 30.0, 20.0, 20.0], "kind": "shift_only"},
    ]
    res = evaluate_diff(preds, truth)
    assert res["recall"] == 1.0
    assert res["false_positives"] == 0
    assert res["kind_accuracy"] == 1.0
    assert res["mean_iou"] == pytest.approx(1.0)
    assert len(res["matches"]) == 2


def test_evaluate_partial_recall_and_fp():
    truth = [
        {"id": 1, "bbox_mm": [10.0, 10.0, 5.0, 5.0], "expected_kind": "content"},
        {"id": 2, "bbox_mm": [50.0, 50.0, 5.0, 5.0], "expected_kind": "content"},
    ]
    preds = [
        {"id": 101, "bbox_mm": [10.0, 10.0, 5.0, 5.0], "kind": "content"},
        {"id": 102, "bbox_mm": [90.0, 90.0, 5.0, 5.0], "kind": "content"},  # FP
    ]
    res = evaluate_diff(preds, truth)
    assert res["recall"] == 0.5
    assert res["false_positives"] == 1
    assert len(res["unmatched_truth"]) == 1
    assert res["unmatched_truth"][0]["truth_id"] == 2
    assert len(res["unmatched_predictions"]) == 1
    assert res["unmatched_predictions"][0]["pred_id"] == 102


def test_evaluate_wrong_kind():
    truth = [
        {"id": 1, "bbox_mm": [10.0, 10.0, 20.0, 20.0], "expected_kind": "shift_only"}
    ]
    preds = [
        {"id": 101, "bbox_mm": [10.0, 10.0, 20.0, 20.0], "kind": "moved"}
    ]
    res = evaluate_diff(preds, truth)
    assert res["recall"] == 1.0
    assert res["kind_accuracy"] == 0.0
    assert res["false_positives"] == 0
    assert res["matches"][0]["kind_match"] is False


def test_evaluate_center_inside_small_box():
    # Character box is tiny [10.0, 10.0, 1.0, 1.0] (area 1.0)
    # Prediction box is dilated [9.0, 9.0, 8.0, 8.0] (area 64.0)
    # IoU = 1.0 / 64.0 = 0.0156 < 0.1, but center (10.5, 10.5) is inside prediction!
    truth = [
        {"id": 1, "bbox_mm": [10.0, 10.0, 1.0, 1.0], "expected_kind": "content"}
    ]
    preds = [
        {"id": 1, "bbox_mm": [9.0, 9.0, 8.0, 8.0], "kind": "content"}
    ]
    res = evaluate_diff(preds, truth)
    assert res["recall"] == 1.0
    assert res["false_positives"] == 0
    assert res["matches"][0]["match_reason"] == "center_inside"


def test_evaluate_synthetic_case_files(tmp_path):
    case_truth_path = Path("tests/synth/runs/case_1_delete_char/truth.json")
    assert case_truth_path.exists()

    with open(case_truth_path) as f:
        truth_data = json.load(f)

    # Mock prediction file matching truth exactly
    mock_diff = {
        "regions": [
            {
                "id": 1,
                "bbox_mm": truth_data[0]["bbox_mm"],
                "kind": truth_data[0]["expected_kind"],
                "diff_pixels": 45,
            }
        ]
    }
    diff_file = tmp_path / "diff.json"
    diff_file.write_text(json.dumps(mock_diff), encoding="utf-8")

    rep = evaluate_files(diff_file, case_truth_path)
    assert rep["recall"] == 1.0
    assert rep["false_positives"] == 0
    assert rep["kind_accuracy"] == 1.0
