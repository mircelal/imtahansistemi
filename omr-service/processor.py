"""
OMR emal prosessoru.

Şablon: outputColumns ilə uyğun sütun adları; sual sütunları q1 / Q1 hər ikisi doldurulur.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import pandas as pd

from template_manager import build_template_config

OMRCHECKER_ROOT = Path(os.environ.get("OMRCHECKER_ROOT", "/opt/OMRChecker"))


def _read_qr(image_bytes: bytes) -> str | None:
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return None
    detector = cv2.QRCodeDetector()
    data, _, _ = detector.detectAndDecode(img)
    if data and data.strip():
        return data.strip()
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    data, _, _ = detector.detectAndDecode(enhanced)
    return data.strip() if data and data.strip() else None


def _parse_qr(qr_data: str | None) -> tuple[str | None, int | None]:
    if not qr_data:
        return None, None
    try:
        parts = qr_data.split(":")
        if len(parts) >= 4 and parts[0] == "omr" and parts[1] == "v1":
            return parts[2], int(parts[3])
    except (ValueError, IndexError):
        pass
    return None, None


def preprocess_image(image_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Invalid image")
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return cv2.equalizeHist(gray)


def _sanitize_template_for_omr(tpl: dict[str, Any]) -> dict[str, Any]:
    """OMRChecker yalnız tanıdığı açar sözləri saxlayır."""
    drop = {
        "meta",
        "_processor",
        "two_page_pdf",
        "omr_two_page_stitched",
        "identity_fieldBlocks",
        "identity_outputColumns",
    }
    return {k: v for k, v in tpl.items() if k not in drop}


def _count_question_columns(output_columns: list[str]) -> int:
    return len([c for c in output_columns if re.match(r"^q\d+$", str(c), re.I)])


def _heuristic_fallback(
    image_bytes: bytes,
    q_columns: int,
    detail: str,
    sheet_uuid: str | None = None,
    exam_id_from_qr: int | None = None,
) -> dict[str, Any]:
    try:
        preprocess_image(image_bytes)
    except ValueError:
        return {
            "answers": {},
            "confidence": 0.0,
            "status": "error",
            "error": "invalid_image",
            "multi_marked": 0,
            "blank_ratio": 1.0,
            "detail": detail,
            "sheet_uuid": sheet_uuid,
            "exam_id_from_qr": exam_id_from_qr,
        }
    answers: dict[str, str] = {}
    for i in range(1, q_columns + 1):
        answers[f"Q{i}"] = ""
        answers[f"q{i}"] = ""
    return {
        "answers": answers,
        "confidence": 0.35,
        "status": "manual_review",
        "multi_marked": 0,
        "blank_ratio": 1.0,
        "detail": detail,
        "sheet_uuid": sheet_uuid,
        "exam_id_from_qr": exam_id_from_qr,
    }


def _resolve_template(template_config: dict[str, Any]) -> dict[str, Any]:
    if "omr_template" in template_config:
        omr = dict(template_config["omr_template"])
    elif "pageDimensions" in template_config and "fieldBlocks" in template_config:
        omr = dict(template_config)
    else:
        omr = build_template_config(template_config)
    return _sanitize_template_for_omr(omr)


def _parse_results_row(row: list[Any], output_columns: list[str]) -> dict[str, str]:
    answers: dict[str, str] = {}
    for i, col in enumerate(output_columns):
        raw = row[4 + i] if len(row) > 4 + i else ""
        if raw is None or (isinstance(raw, float) and np.isnan(raw)) or str(raw).strip() == "":
            val = ""
        else:
            val = str(raw).strip()
        key = str(col).strip()
        answers[key] = val
        m = re.match(r"^q(\d+)$", key, re.I)
        if m:
            answers[f"Q{m.group(1)}"] = val
    return answers


def _find_results_csv(output_root: Path) -> Path | None:
    candidates = sorted(
        output_root.rglob("*.csv"),
        key=lambda p: p.stat().st_mtime if p.exists() else 0,
        reverse=True,
    )
    for p in candidates:
        name = p.name.lower()
        if "error" in name:
            continue
        if "result" in name or "results" in name:
            return p
    return candidates[0] if candidates else None


def _run_omrchecker_subprocess(work_dir: Path, out_dir: Path) -> subprocess.CompletedProcess:
    main_py = OMRCHECKER_ROOT / "main.py"
    if not main_py.is_file():
        raise FileNotFoundError("OMRChecker main.py not found")
    return subprocess.run(
        [sys.executable, str(main_py), "-i", str(work_dir), "-o", str(out_dir)],
        cwd=str(OMRCHECKER_ROOT),
        capture_output=True,
        text=True,
        timeout=180,
    )


def _blank_ratio_questions(answers: dict[str, str], q_count: int) -> float:
    if q_count <= 0:
        return 0.0
    blank = 0
    for i in range(1, q_count + 1):
        v = answers.get(f"q{i}") or answers.get(f"Q{i}") or ""
        if not str(v).strip():
            blank += 1
    return blank / q_count


def process_omr(image_bytes: bytes, template_config: dict[str, Any]) -> dict[str, Any]:
    qr_raw = _read_qr(image_bytes)
    sheet_uuid, exam_id_from_qr = _parse_qr(qr_raw)

    full_template = _resolve_template(template_config)
    out_cols = list(full_template.get("outputColumns") or [])
    q_count = _count_question_columns(out_cols)
    if q_count == 0:
        q_count = int(template_config.get("question_count", 50))

    if not OMRCHECKER_ROOT.joinpath("main.py").is_file():
        return _heuristic_fallback(
            image_bytes, q_count, "OMRChecker not installed (missing /opt/OMRChecker).",
            sheet_uuid, exam_id_from_qr,
        )

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / "inputs"
        out = Path(tmp) / "outputs"
        work.mkdir(parents=True)
        out.mkdir()
        (work / "template.json").write_text(json.dumps(full_template), encoding="utf-8")
        (work / "sheet.png").write_bytes(image_bytes)

        proc = _run_omrchecker_subprocess(work, out)
        if proc.returncode != 0:
            return _heuristic_fallback(
                image_bytes, q_count,
                f"OMRChecker exit {proc.returncode}: {(proc.stderr or '')[:500]}",
                sheet_uuid, exam_id_from_qr,
            )

        results_csv = _find_results_csv(out)
        if results_csv is None:
            return _heuristic_fallback(
                image_bytes, q_count, "No results CSV from OMRChecker.",
                sheet_uuid, exam_id_from_qr,
            )

        try:
            df = pd.read_csv(results_csv, header=None)
            if df.empty:
                raise ValueError("empty results")
            row = df.iloc[-1].tolist()
            answers = _parse_results_row(row, out_cols)
        except Exception as err:  # noqa: BLE001
            return _heuristic_fallback(
                image_bytes, q_count, f"Parse error: {err}",
                sheet_uuid, exam_id_from_qr,
            )

        blank_ratio = _blank_ratio_questions(answers, q_count)
        confidence = max(0.0, min(1.0, 1.0 - 0.4 * blank_ratio))
        status = "ok" if confidence >= 0.85 else "manual_review"
        return {
            "answers": answers,
            "confidence": round(confidence, 4),
            "status": status,
            "multi_marked": 0,
            "blank_ratio": round(blank_ratio, 4),
            "detail": "omrchecker",
            "sheet_uuid": sheet_uuid,
            "exam_id_from_qr": exam_id_from_qr,
        }
