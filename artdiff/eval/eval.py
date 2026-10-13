"""Evaluation tool for ARTDIFF Phase 2: Compares diff.json against ground truth.

Matching criteria (per Phase 2 Spec section 6 Task 1):
  - IoU >= 0.1 OR center of ground truth box is inside the predicted box.
Metrics reported:
  - recall: matched ground truth / total ground truth
  - false_positives: number of predicted regions not matched to any ground truth
  - kind_accuracy: fraction of matched regions that have the expected kind
  - mean_iou: average IoU of matched regions
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def box_iou(b1: tuple[float, float, float, float] | list[float],
            b2: tuple[float, float, float, float] | list[float]) -> float:
    """Compute Intersection over Union (IoU) of two [x, y, w, h] boxes."""
    x1, y1, w1, h1 = b1
    x2, y2, w2, h2 = b2

    xi1 = max(x1, x2)
    yi1 = max(y1, y2)
    xi2 = min(x1 + w1, x2 + w2)
    yi2 = min(y1 + h1, y2 + h2)

    iw = max(0.0, xi2 - xi1)
    ih = max(0.0, yi2 - yi1)
    inter = iw * ih

    union = (w1 * h1) + (w2 * h2) - inter
    if union <= 0.0:
        return 0.0
    return inter / union


def is_center_inside(inner: tuple[float, float, float, float] | list[float],
                     outer: tuple[float, float, float, float] | list[float]) -> bool:
    """Check if center of `inner` box lies inside `outer` box."""
    cx = inner[0] + inner[2] / 2.0
    cy = inner[1] + inner[3] / 2.0
    return (outer[0] <= cx <= outer[0] + outer[2]) and (outer[1] <= cy <= outer[1] + outer[3])


def evaluate_diff(
    diff_regions: list[dict[str, Any]],
    truth_regions: list[dict[str, Any]],
    min_iou: float = 0.1,
) -> dict[str, Any]:
    """Evaluate predicted diff regions against ground truth regions."""
    truth_count = len(truth_regions)
    pred_count = len(diff_regions)

    # If truth is empty (e.g. no-change test)
    if truth_count == 0:
        return {
            "truth_count": 0,
            "pred_count": pred_count,
            "matched_truth_count": 0,
            "recall": 1.0,
            "false_positives": pred_count,
            "kind_accuracy": 1.0 if pred_count == 0 else 0.0,
            "mean_iou": 1.0 if pred_count == 0 else 0.0,
            "matches": [],
            "unmatched_truth": [],
            "unmatched_predictions": [
                {
                    "pred_id": p.get("id"),
                    "bbox_mm": p.get("bbox_mm"),
                    "kind": p.get("kind"),
                }
                for p in diff_regions
            ],
        }

    # Build match candidates matrix (truth_idx -> list of (score, pred_idx, iou, reason))
    matched_truth: dict[int, dict[str, Any]] = {}
    used_pred_indices: set[int] = set()

    # Pass 1: Match by best IoU >= min_iou
    candidates: list[tuple[float, int, int, float, str]] = []  # (score, t_idx, p_idx, iou, reason)
    for t_idx, t in enumerate(truth_regions):
        t_box = t["bbox_mm"]
        for p_idx, p in enumerate(diff_regions):
            p_box = p["bbox_mm"]
            iou = box_iou(t_box, p_box)
            center_in = is_center_inside(t_box, p_box)
            if iou >= min_iou:
                candidates.append((iou, t_idx, p_idx, iou, "iou"))
            elif center_in:
                # Give center containment lower priority score than direct IoU
                candidates.append((0.05 + iou, t_idx, p_idx, iou, "center_inside"))

    # Greedy match by score descending
    candidates.sort(key=lambda c: c[0], reverse=True)
    for _, t_idx, p_idx, iou, reason in candidates:
        if t_idx in matched_truth or p_idx in used_pred_indices:
            continue
        t_item = truth_regions[t_idx]
        p_item = diff_regions[p_idx]
        exp_kind = t_item.get("expected_kind", t_item.get("kind", "content"))
        pred_kind = p_item.get("kind", "content")
        kind_match = (exp_kind == pred_kind)

        matched_truth[t_idx] = {
            "truth_id": t_item.get("id", t_idx + 1),
            "pred_id": p_item.get("id", p_idx + 1),
            "truth_bbox_mm": t_item["bbox_mm"],
            "pred_bbox_mm": p_item["bbox_mm"],
            "expected_kind": exp_kind,
            "predicted_kind": pred_kind,
            "kind_match": kind_match,
            "iou": round(iou, 4),
            "match_reason": reason,
            "note": t_item.get("note", ""),
        }
        used_pred_indices.add(p_idx)

    # Compute metrics
    matched_count = len(matched_truth)
    recall = matched_count / truth_count
    false_positives = pred_count - len(used_pred_indices)

    if matched_count > 0:
        kind_correct = sum(1 for m in matched_truth.values() if m["kind_match"])
        kind_acc = kind_correct / matched_count
        mean_iou = sum(m["iou"] for m in matched_truth.values()) / matched_count
    else:
        kind_acc = 0.0
        mean_iou = 0.0

    unmatched_truth = [
        {
            "truth_id": t.get("id", idx + 1),
            "bbox_mm": t["bbox_mm"],
            "expected_kind": t.get("expected_kind", t.get("kind")),
            "note": t.get("note", ""),
        }
        for idx, t in enumerate(truth_regions)
        if idx not in matched_truth
    ]

    unmatched_predictions = [
        {
            "pred_id": p.get("id", idx + 1),
            "bbox_mm": p.get("bbox_mm"),
            "kind": p.get("kind"),
        }
        for idx, p in enumerate(diff_regions)
        if idx not in used_pred_indices
    ]

    matches_list = list(matched_truth.values())
    matches_list.sort(key=lambda m: m["truth_id"])

    return {
        "truth_count": truth_count,
        "pred_count": pred_count,
        "matched_truth_count": matched_count,
        "recall": round(recall, 4),
        "false_positives": false_positives,
        "kind_accuracy": round(kind_acc, 4),
        "mean_iou": round(mean_iou, 4),
        "matches": matches_list,
        "unmatched_truth": unmatched_truth,
        "unmatched_predictions": unmatched_predictions,
    }


def evaluate_files(diff_path: str | Path, truth_path: str | Path) -> dict[str, Any]:
    """Load JSON files and evaluate."""
    with open(diff_path, "r", encoding="utf-8") as f:
        diff_data = json.load(f)
    if isinstance(diff_data, dict) and "regions" in diff_data:
        diff_regions = diff_data["regions"]
    elif isinstance(diff_data, list):
        diff_regions = diff_data
    else:
        diff_regions = []

    with open(truth_path, "r", encoding="utf-8") as f:
        truth_data = json.load(f)
    if isinstance(truth_data, dict) and "regions" in truth_data:
        truth_regions = truth_data["regions"]
    elif isinstance(truth_data, list):
        truth_regions = truth_data
    else:
        truth_regions = []

    return evaluate_diff(diff_regions, truth_regions)


def main() -> int:
    parser = argparse.ArgumentParser(description="ARTDIFF Phase 2: Evaluation script")
    parser.add_argument("--diff", required=True, help="Path to diff.json")
    parser.add_argument("--truth", required=True, help="Path to truth.json")
    parser.add_argument("--out", default=None, help="Optional output JSON path for evaluation report")
    args = parser.parse_args()

    results = evaluate_files(args.diff, args.truth)
    print(f"Truth count: {results['truth_count']} | Predictions: {results['pred_count']}")
    print(f"Recall: {results['recall']*100:.1f}% ({results['matched_truth_count']}/{results['truth_count']})")
    print(f"False Positives: {results['false_positives']}")
    print(f"Kind Accuracy: {results['kind_accuracy']*100:.1f}%")
    print(f"Mean IoU: {results['mean_iou']:.4f}")

    if results["unmatched_truth"]:
        print(f"MISSING ({len(results['unmatched_truth'])} items):")
        for m in results["unmatched_truth"]:
            print(f"  - [{m['truth_id']}] {m['note']} at {m['bbox_mm']}")

    if results["unmatched_predictions"]:
        print(f"EXTRA / FP ({len(results['unmatched_predictions'])} items):")
        for p in results["unmatched_predictions"][:10]:
            print(f"  - Pred #{p['pred_id']} ({p['kind']}) at {p['bbox_mm']}")
        if len(results["unmatched_predictions"]) > 10:
            print(f"  ... and {len(results['unmatched_predictions']) - 10} more.")

    if args.out:
        out_p = Path(args.out)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        with open(out_p, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        print(f"Saved evaluation report to {out_p}")

    return 0 if (results["recall"] == 1.0 and results["false_positives"] == 0) else 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
