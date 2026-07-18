"""Fiducial warp + bubble intensity peaking — OMRChecker-dən asılı olmadan hizalama yoxu."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import httpx
import numpy as np
from sqlalchemy import select

# Image description GT (skaner)
GT = {
    1: "B",
    2: "C",
    3: "D",
    4: "B",
    5: "C",
    6: "A",
    7: "D",
    8: "B",
    9: "C",
    10: "E",
}


def score_vs_gt(mcq: dict[int, str], gt: dict[int, str]) -> int:
    return sum(1 for n, e in gt.items() if mcq.get(n) == e)


def decode_mcq_block(gray: np.ndarray, block: dict) -> dict[int, str]:
    """OMRChecker fieldBlock: origin, bubblesGap, fieldLabels, bubbleValues / labels."""
    ox, oy = block.get("origin") or [0, 0]
    gap = int(block.get("bubblesGap") or block.get("bubblesGap") or 35)
    # Vertical gap for questions
    vgap = int(block.get("fieldLabelsGap") or block.get("labelsGap") or gap)
    # Often bubblesGap is [dx, dy] or scalar
    bg = block.get("bubblesGap")
    if isinstance(bg, (list, tuple)) and len(bg) >= 2:
        dx, dy = int(bg[0]), int(bg[1])
    else:
        dx = int(bg or 35)
        dy = int(block.get("labelsGap") or block.get("fieldLabelsGap") or 42)

    labels = list(block.get("fieldLabels") or [])
    opts = list(block.get("bubbleValues") or block.get("labels") or ["A", "B", "C", "D", "E"])
    # bubble dimensions
    bw = int(block.get("bubbleDimensions", [28, 28])[0] if isinstance(block.get("bubbleDimensions"), list) else 28)
    bh = int(block.get("bubbleDimensions", [28, 28])[1] if isinstance(block.get("bubbleDimensions"), list) else 28)
    r = max(6, min(bw, bh) // 2 - 2)

    out: dict[int, str] = {}
    h, w = gray.shape[:2]
    for qi, lab in enumerate(labels):
        m = None
        import re

        mm = re.search(r"(\d+)", str(lab))
        if mm:
            m = int(mm.group(1))
        else:
            m = qi + 1
        means = []
        for oi, opt in enumerate(opts):
            cx = int(ox + oi * dx + bw // 2)
            cy = int(oy + qi * dy + bh // 2)
            if cx < r or cy < r or cx >= w - r or cy >= h - r:
                means.append((255.0, opt))
                continue
            patch = gray[cy - r : cy + r, cx - r : cx + r]
            means.append((float(np.mean(patch)), opt))
        means.sort(key=lambda t: t[0])
        darkest, opt0 = means[0]
        second = means[1][0] if len(means) > 1 else 255
        # filled bubble is darker; require margin
        if darkest < 180 and (second - darkest) > 8:
            out[m] = str(opt0)[0].upper()
        else:
            out[m] = ""
    return out


def main() -> int:
    # Import omr-service helpers via httpx only for variants? Better copy warp via local cv2 using same logic.
    sys.path.insert(0, "/opt")
    # Call omr-service internal by mounting - instead recreate warp in backend by importing? can't.
    # Use omr container.
    print("run inside omr-service preferred")
    return 0


if __name__ == "__main__":
    # This script is intended to run in omr-service container
    from processor import (  # type: ignore
        _prepare_sheet_variants,
        _resolve_template,
    )

    tpl_path = Path("/tmp/tpl43.json")
    img_path = Path("/tmp/scan.jpg")
    tpl = json.loads(tpl_path.read_text(encoding="utf-8"))
    full = _resolve_template({"omr_template": tpl} if "pageDimensions" in tpl else tpl)
    if "pageDimensions" not in full and "omr_template" in tpl:
        full = _resolve_template(tpl)

    # If tpl is already omr template:
    if "fieldBlocks" in tpl:
        full = tpl

    image_bytes = img_path.read_bytes()
    variants = _prepare_sheet_variants(image_bytes, full.get("pageDimensions") or [2480, 3508])
    print("variants", len(variants), [v[0] for v in variants])

    mcq_block = None
    fb = full.get("fieldBlocks") or {}
    for name, b in fb.items():
        if name.startswith("MCQ_") and len(b.get("fieldLabels") or []) >= 20:
            mcq_block = b
            print("using block", name, "origin", b.get("origin"), "gap", b.get("bubblesGap"), "labelsGap", b.get("labelsGap") or b.get("fieldLabelsGap"), "dims", b.get("bubbleDimensions"))
            break
    if mcq_block is None:
        print("no mcq block")
        return 1

    # normalize gap fields present in OMRChecker templates
    # Often: bubblesGap: [35, 0], labelsGap: 42 — check dump
    print(json.dumps({k: mcq_block.get(k) for k in ("origin", "bubblesGap", "labelsGap", "fieldLabelsGap", "bubbleDimensions", "bubbleValues", "labels")}, ensure_ascii=False))

    best = (-1, "", {})
    for label, bgr, _strip in variants:
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        # try a grid of label gaps
        for dy in (36, 38, 40, 42, 44, 46, 48, 50):
            blk = dict(mcq_block)
            # inject dy
            bg = blk.get("bubblesGap")
            if isinstance(bg, list):
                blk["bubblesGap"] = [int(bg[0]), dy]
            else:
                blk["bubblesGap"] = int(bg or 35)
                blk["labelsGap"] = dy
            mcq = decode_mcq_block(gray, blk)
            sc = score_vs_gt(mcq, GT)
            filled = sum(1 for v in mcq.values() if v)
            if sc > best[0]:
                best = (sc, f"{label}/dy={dy}/filled={filled}", mcq)
        # also native dy from template
        mcq = decode_mcq_block(gray, mcq_block)
        sc = score_vs_gt(mcq, GT)
        if sc > best[0]:
            best = (sc, f"{label}/native", mcq)

    print("BEST", best[0], best[1])
    print("answers", sorted((k, v) for k, v in best[2].items() if v)[:20])
    return 0 if best[0] >= 8 else 2
