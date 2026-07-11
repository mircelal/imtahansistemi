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

    def _try_decode(bgr: np.ndarray) -> str | None:
        detector = cv2.QRCodeDetector()
        data, _, _ = detector.detectAndDecode(bgr)
        if data and str(data).strip():
            return str(data).strip()
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        data, _, _ = detector.detectAndDecode(enhanced)
        if data and str(data).strip():
            return str(data).strip()
        # Aşağı kontrast (ekran görüntüsü / telefon foto)
        _, thresh = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        data, _, _ = detector.detectAndDecode(thresh)
        return str(data).strip() if data and str(data).strip() else None

    def _scan_frame(bgr: np.ndarray) -> str | None:
        hit = _try_decode(bgr)
        if hit:
            return hit
        h, w = bgr.shape[:2]
        # Cavab kartında QR adətən aşağı sağ küncdədir
        for y0, x0 in ((0.72, 0.45), (0.78, 0.5), (0.82, 0.55), (0.85, 0.6)):
            crop = bgr[int(h * y0) :, int(w * x0) :]
            if crop.size == 0:
                continue
            hit = _try_decode(crop)
            if hit:
                return hit
        return None

    for scale in (1.0, 1.5, 2.0, 2.5, 3.0):
        if scale == 1.0:
            frame = img
        else:
            frame = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        hit = _scan_frame(frame)
        if hit:
            return hit
    return None


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


def _sanitize_field_block(block: dict[str, Any]) -> dict[str, Any]:
    """OMRChecker fieldBlock: fieldType və ya bubbleValues+direction tələb edir."""
    blk = dict(block)
    if "fieldType" not in blk and "bubbleValues" in blk and "direction" not in blk:
        n = len(blk.get("bubbleValues") or [])
        if n in (4, 5):
            blk["fieldType"] = f"QTYPE_MCQ{n}"
        else:
            blk["direction"] = "horizontal"
    return blk


def _sanitize_template_for_omr(tpl: dict[str, Any]) -> dict[str, Any]:
    """OMRChecker yalnız tanıdığı açar sözləri saxlayır."""
    drop = {
        "meta",
        "_processor",
        "two_page_pdf",
        "omr_two_page_stitched",
        "identity_fieldBlocks",
        "identity_outputColumns",
        "bubbleValues",
        "options",
    }
    out = {k: v for k, v in tpl.items() if k not in drop}
    raw_blocks = out.get("fieldBlocks")
    if isinstance(raw_blocks, dict):
        out["fieldBlocks"] = {k: _sanitize_field_block(v) for k, v in raw_blocks.items()}
    return out


def _count_question_columns(output_columns: list[str]) -> int:
    return len([c for c in output_columns if re.match(r"^q\d+$", str(c), re.I)])


def _heuristic_fallback(
    image_bytes: bytes,
    q_columns: int,
    detail: str,
    sheet_uuid: str | None = None,
    exam_id_from_qr: int | None = None,
    *,
    as_error: bool = False,
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
    status = "error" if as_error else "manual_review"
    confidence = 0.0 if as_error else 0.35
    return {
        "answers": answers,
        "confidence": confidence,
        "status": status,
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


def _parse_results_dataframe(df: pd.DataFrame, output_columns: list[str]) -> dict[str, str]:
    """OMRChecker CSV — birinci sətir başlıqdır; son data sətirindən oxu."""
    answers: dict[str, str] = {}
    if df.empty:
        return answers
    row = df.iloc[-1]
    for col in output_columns:
        key = str(col).strip()
        if key not in df.columns:
            raw = ""
        else:
            raw = row[key]
        if raw is None or (isinstance(raw, float) and np.isnan(raw)) or str(raw).strip() == "":
            val = ""
        else:
            val = str(raw).strip()
        answers[key] = val
        m = re.match(r"^q(\d+)$", key, re.I)
        if m:
            answers[f"Q{m.group(1)}"] = val
    return answers


def _csv_has_data_rows(path: Path) -> bool:
    try:
        df = pd.read_csv(path)
    except Exception:  # noqa: BLE001
        return False
    return not df.empty


def _alignment_failed_row(df: pd.DataFrame) -> bool:
    if df.empty or "output_path" not in df.columns:
        return False
    op = str(df.iloc[-1].get("output_path") or "")
    return "ErrorFiles" in op or "MultiMarked" in op


def _answers_look_like_header_spill(answers: dict[str, str], output_columns: list[str]) -> bool:
    """Köhnə parser xətası: başlıq sətri cavab kimi oxunub."""
    probe = [str(c) for c in output_columns[:8]]
    if not probe:
        return False
    hits = sum(1 for c in probe if answers.get(c) == c)
    return hits >= max(3, len(probe) // 2)


def _find_results_csv(output_root: Path) -> Path | None:
    """OMRChecker nəticə CSV — yalnız data sətri olan fayllar."""
    result_candidates: list[tuple[int, Path]] = []
    fallback: list[Path] = []
    for p in output_root.rglob("*.csv"):
        name = p.name.lower()
        if not _csv_has_data_rows(p):
            continue
        if "result" in name and "error" not in name:
            try:
                result_candidates.append((len(pd.read_csv(p)), p))
            except Exception:  # noqa: BLE001
                continue
        elif name in ("errorfiles.csv", "multimarkedfiles.csv"):
            fallback.append(p)
    if result_candidates:
        result_candidates.sort(key=lambda x: x[0], reverse=True)
        return result_candidates[0][1]
    return fallback[0] if fallback else None


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
            err_tail = (proc.stderr or proc.stdout or "")[-800:]
            return _heuristic_fallback(
                image_bytes,
                q_count,
                f"OMRChecker exit {proc.returncode}: {err_tail}",
                sheet_uuid,
                exam_id_from_qr,
                as_error=True,
            )

        results_csv = _find_results_csv(out)
        if results_csv is None:
            return _heuristic_fallback(
                image_bytes,
                q_count,
                "No results CSV from OMRChecker.",
                sheet_uuid,
                exam_id_from_qr,
                as_error=True,
            )

        try:
            df = pd.read_csv(results_csv)
            if df.empty:
                raise ValueError("empty results")
            answers = _parse_results_dataframe(df, out_cols)
            if _answers_look_like_header_spill(answers, out_cols):
                raise ValueError("header row parsed as data")
        except Exception as err:  # noqa: BLE001
            return _heuristic_fallback(
                image_bytes,
                q_count,
                f"Parse error: {err}",
                sheet_uuid,
                exam_id_from_qr,
                as_error=True,
            )

        alignment_failed = _alignment_failed_row(df)
        blank_ratio = _blank_ratio_questions(answers, q_count)
        confidence = max(0.0, min(1.0, 1.0 - 0.4 * blank_ratio))
        if alignment_failed:
            confidence = min(confidence, 0.25)
        status = "ok" if confidence >= 0.85 and not alignment_failed else "manual_review"
        detail = "omrchecker"
        if alignment_failed:
            detail = "omrchecker_alignment_failed"
        return {
            "answers": answers,
            "confidence": round(confidence, 4),
            "status": status,
            "multi_marked": 0,
            "blank_ratio": round(blank_ratio, 4),
            "detail": detail,
            "sheet_uuid": sheet_uuid,
            "exam_id_from_qr": exam_id_from_qr,
        }
