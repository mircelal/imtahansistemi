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


def _env_flag(name: str, default: bool = True) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return int(str(raw).strip())
    except ValueError:
        return default


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


# OMRChecker-in FIELD_TYPES defolt bubbleValues-u (src/constants/common.py) —
# bubbleValues açıq şəkildə verilməyən fieldType-lar üçün etibarlı qiymətlər siyahısı.
_FIELD_TYPE_DEFAULT_VALUES: dict[str, list[str]] = {
    "QTYPE_INT": [str(i) for i in range(10)],
    "QTYPE_INT_FROM_1": [str(i) for i in range(1, 10)] + ["0"],
    "QTYPE_MCQ2": ["A", "B"],
    "QTYPE_MCQ3": ["A", "B", "C"],
    "QTYPE_MCQ4": ["A", "B", "C", "D"],
    "QTYPE_MCQ5": ["A", "B", "C", "D", "E"],
    "QTYPE_MCQ4_RTL": ["D", "C", "B", "A"],
    "QTYPE_MCQ5_RTL": ["E", "D", "C", "B", "A"],
}


def _field_label_value_sets(full_template: dict[str, Any]) -> dict[str, set[str]]:
    """Hər outputColumn üçün etibarlı (tək bubbleValue və ya boş) qiymətlər dəsti.

    Sıx düzülmüş sahələrdə (məs. 32 hərfli şəxsiyyət sütunları) OMRChecker-in
    sütun-daxili local-threshold alqoritmi bəzən heç bir dəqiq işarə tapa bilmədikdə
    bütün variantları birləşdirilmiş sətir kimi qaytarır (multi-mark). Bu funksiya
    həmin "cəfəngiyat" qiymətləri aşkarlamaq üçün hər sahənin gerçək bubbleValues
    dəstini (+ emptyValue) toplayır.
    """
    empty_val = str(full_template.get("emptyValue", ""))
    out: dict[str, set[str]] = {}
    field_blocks = full_template.get("fieldBlocks") or {}
    if not isinstance(field_blocks, dict):
        return out
    for block in field_blocks.values():
        if not isinstance(block, dict):
            continue
        labels = block.get("fieldLabels") or []
        if isinstance(labels, str):
            labels = [labels]
        values = block.get("bubbleValues")
        if not values:
            values = _FIELD_TYPE_DEFAULT_VALUES.get(str(block.get("fieldType") or ""), [])
        value_set = {str(v) for v in values} | {empty_val}
        for label in labels:
            out[str(label)] = value_set
    return out


def _parse_results_dataframe(
    df: pd.DataFrame,
    output_columns: list[str],
    value_sets: dict[str, set[str]] | None = None,
) -> tuple[dict[str, str], int]:
    """OMRChecker CSV — birinci sətir başlıqdır; son data sətirindən oxu.

    value_sets verildikdə, sahənin qaytardığı qiymət o sahə üçün etibarlı tək
    bubbleValue (və ya boş) deyilsə, bu multi-mark/qeyri-müəyyən nəticə kimi sayılır
    və "" olaraq sıfırlanır (qarışıq hərflər səssizcə səhv qiymətləndirilməsin deyə).
    """
    answers: dict[str, str] = {}
    multi_marked = 0
    if df.empty:
        return answers, multi_marked
    row = df.iloc[-1]
    value_sets = value_sets or {}
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
        allowed = value_sets.get(key)
        if allowed is not None and val not in allowed:
            multi_marked += 1
            # DİM: çox işarələmə boş deyil — səhv cavab kimi qiymətləndirilir
            val = "MULTI"
        answers[key] = val
        m = re.match(r"^q(\d+)$", key, re.I)
        if m:
            answers[f"Q{m.group(1)}"] = val
    return answers, multi_marked


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


def _write_local_config(work_dir: Path, full_template: dict[str, Any]) -> None:
    """OMRChecker-in defolt emal ölçüsü (666x820, nisbət 0.81) A4 cavab kartımızın
    həqiqi nisbətinə (~0.71) uyğun deyil. CropPage sərhəd axtarışı bu təhrif olunmuş
    kiçik ölçüdə aparılır və tapılan düzbucaqlı sonra tam səhifə ölçüsünə geri
    böyüdüldükdə hər piksellik xəta bir neçə dəfə artır — bu, tam düzülmüş fotolarda
    belə kabbala oxşar (bütünlüklə boş) nəticələrə səbəb olurdu.
    Buna görə emal ölçüsünü, səhifənin öz en/uzunluq nisbətini saxlayaraq, daha
    yüksək dəqiqliklə üst-üstə düşəcək şəkildə override edirik.
    """
    page_dims = full_template.get("pageDimensions")
    if not isinstance(page_dims, (list, tuple)) or len(page_dims) != 2:
        return
    page_w, page_h = page_dims
    try:
        page_w = float(page_w)
        page_h = float(page_h)
    except (TypeError, ValueError):
        return
    if page_w <= 0 or page_h <= 0:
        return
    cfg = {"dimensions": {"processing_width": round(page_w), "processing_height": round(page_h)}}
    (work_dir / "config.json").write_text(json.dumps(cfg), encoding="utf-8")


def _blank_ratio_questions(answers: dict[str, str], q_count: int) -> float:
    if q_count <= 0:
        return 0.0
    blank = 0
    for i in range(1, q_count + 1):
        v = answers.get(f"q{i}") or answers.get(f"Q{i}") or ""
        if not str(v).strip():
            blank += 1
    return blank / q_count


def _decode_bgr(image_bytes: bytes) -> np.ndarray | None:
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img


def _fiducial_inset_px(page_w: float, page_h: float) -> int:
    """PDF fiducial mərkəzi: edge_inset 0.7mm + outer_r 3.0mm → A4/300dpi ≈ 44px."""
    dpi = float(page_w) / 210.0 * 25.4 if page_w > 0 else 300.0
    return max(20, int(round(3.7 / 25.4 * dpi)))


def _corner_fiducial_candidates(
    img: np.ndarray,
) -> list[list[tuple[float, float, float, float, float, float]]] | None:
    """Hər künc üçün namizədlər: (gx, gy, r, circ, area, dist)."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    rmin, rmax = min(h, w) * 0.0018, min(h, w) * 0.035
    bw, bh = int(w * 0.22), int(h * 0.18)
    corners = [
        ((0, bw, 0, bh), (0.0, 0.0)),
        ((w - bw, w, 0, bh), (float(w), 0.0)),
        ((w - bw, w, h - bh, h), (float(w), float(h))),
        ((0, bw, h - bh, h), (0.0, float(h))),
    ]
    out: list[list[tuple[float, float, float, float, float, float]]] = []
    for (x0, x1, y0, y1), pref in corners:
        roi = gray[y0:y1, x0:x1]
        if roi.size == 0:
            return None
        blur = cv2.GaussianBlur(roi, (5, 5), 0)
        _, th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        cnts, _ = cv2.findContours(th, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        cands: list[tuple[float, float, float, float, float, float]] = []
        for c in cnts:
            area = float(cv2.contourArea(c))
            if area < 20:
                continue
            peri = float(cv2.arcLength(c, True))
            if peri < 1:
                continue
            circ = 4.0 * np.pi * area / (peri * peri)
            if circ < 0.55:
                continue
            (x, y), r = cv2.minEnclosingCircle(c)
            if r < rmin or r > rmax:
                continue
            gx, gy = float(x0) + float(x), float(y0) + float(y)
            dist = float(np.hypot(gx - pref[0], gy - pref[1]))
            cands.append((gx, gy, float(r), circ, area, dist))
        if not cands:
            return None
        out.append(cands)
    return out


def _pick_quad_by_key(
    corner_cands: list[list[tuple[float, float, float, float, float, float]]],
    key_fn,
) -> np.ndarray | None:
    """key_fn: namizəd → sortable tuple (kiçik daha yaxşı)."""
    pts: list[list[float]] = []
    for cands in corner_cands:
        best = sorted(cands, key=key_fn)[0]
        pts.append([best[0], best[1]])
    quad = np.array(pts, dtype=np.float32)
    if len({(round(p[0]), round(p[1])) for p in quad}) < 4:
        return None
    return quad


def _detect_fiducial_quad_candidates(img: np.ndarray) -> list[np.ndarray]:
    """Bir neçə fiducial strategiyası — scanner və telefon üçün fərqli winner ola bilər."""
    corner_cands = _corner_fiducial_candidates(img)
    if not corner_cands:
        return []
    h, w = img.shape[:2]
    diag = float(np.hypot(h, w))
    quads: list[np.ndarray] = []

    # 1) Scanner edge-crop: fiducial küncə yaxın, amma 1–3px border noise deyil.
    #    Tipik inset ~0.8–4% of min(h,w).
    min_side = float(min(h, w))
    band_lo, band_hi = 0.005 * min_side, 0.06 * min_side

    def _nearest_key(t: tuple[float, float, float, float, float, float]) -> tuple:
        gx, gy, r, circ, area, dist = t
        edge = min(gx, float(w) - gx, gy, float(h) - gy)
        in_band = band_lo <= edge <= band_hi
        # band xaricində çox cərimə — kənar noise və ya daxili bubble
        band_pen = 0.0 if in_band else 500.0 + abs(edge - 0.02 * min_side)
        return (band_pen + dist, -circ, -area)

    q = _pick_quad_by_key(corner_cands, _nearest_key)
    if q is not None:
        quads.append(q)

    # 2) Keyfiyyət / məsafə (telefon desk background üçün yaxşı)
    def _hybrid_key(t: tuple[float, float, float, float, float, float]) -> tuple:
        gx, gy, r, circ, area, dist = t
        score = (circ * min(area, 2500.0)) / (1.0 + dist / (0.08 * diag))
        return (-score,)

    q = _pick_quad_by_key(corner_cands, _hybrid_key)
    if q is not None:
        quads.append(q)

    # 3) Oxşar radius kombinasiyası
    best_quad = None
    best_metric = -1.0
    top = [sorted(c, key=_hybrid_key)[:4] for c in corner_cands]
    for i0 in range(len(top[0])):
        for i1 in range(len(top[1])):
            for i2 in range(len(top[2])):
                for i3 in range(len(top[3])):
                    pick = [top[0][i0], top[1][i1], top[2][i2], top[3][i3]]
                    rs = [p[2] for p in pick]
                    r_med = float(np.median(rs))
                    if r_med <= 0 or max(rs) / max(min(rs), 1e-3) > 2.8:
                        continue
                    r_var = float(np.std(rs) / r_med)
                    qual = sum((p[3] * min(p[4], 2500.0)) / (1.0 + p[5] / (0.08 * diag)) for p in pick)
                    metric = qual / (1.0 + 4.0 * r_var)
                    if metric > best_metric:
                        best_metric = metric
                        best_quad = np.array([[p[0], p[1]] for p in pick], dtype=np.float32)
    if best_quad is not None:
        quads.append(best_quad)

    # unikal
    uniq: list[np.ndarray] = []
    seen: set[tuple] = set()
    for quad in quads:
        key = tuple((round(p[0]), round(p[1])) for p in quad)
        if key in seen:
            continue
        seen.add(key)
        uniq.append(quad)
    return uniq


def _warp_quad_to_page(img: np.ndarray, quad: np.ndarray, page_w: int, page_h: int, inset: int) -> np.ndarray:
    dst = np.array(
        [
            [inset, inset],
            [page_w - 1 - inset, inset],
            [page_w - 1 - inset, page_h - 1 - inset],
            [inset, page_h - 1 - inset],
        ],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(quad, dst)
    return cv2.warpPerspective(img, matrix, (page_w, page_h), borderValue=(255, 255, 255))


def _prepare_sheet_variants(
    image_bytes: bytes, page_dims: list[Any]
) -> list[tuple[str, np.ndarray, bool, int]]:
    """
    OMRChecker üçün şəkil variantları.
    strip_crop=True → template-dən CropPage çıxar (səhifə artıq normalize olunub).
    4-cü dəyər: nominal fiducial inset-dən |delta| (ranking cəriməsi).
    """
    img = _decode_bgr(image_bytes)
    if img is None:
        return []
    try:
        page_w, page_h = int(page_dims[0]), int(page_dims[1])
    except (TypeError, ValueError, IndexError):
        page_w, page_h = 2480, 3508
    if page_w < 100 or page_h < 100:
        page_w, page_h = 2480, 3508

    variants: list[tuple[str, np.ndarray, bool, int]] = []
    inset = _fiducial_inset_px(page_w, page_h)
    # Scanner vs telefon fərqli inset uduzur — daha geniş diapazon sına
    insets = sorted(
        {
            max(12, inset - 12),
            max(16, inset - 8),
            max(20, inset - 4),
            inset,
            inset + 4,
            inset + 8,
            inset + 12,
            inset + 16,
        }
    )
    # Nominal insetə yaxın → əvvəl (tez qalib / early-exit)
    insets_ordered = sorted(insets, key=lambda i: (abs(i - inset), i))
    for qi, quad in enumerate(_detect_fiducial_quad_candidates(img)):
        for ins in insets_ordered:
            warped = _warp_quad_to_page(img, quad, page_w, page_h, ins)
            variants.append((f"fiducial_q{qi}_i{ins}", warped, True, abs(ins - inset)))

    # Fallback: decode edilmiş PNG; CropPage saxlanılır
    variants.append(("raw_decoded", img, False, 10_000))
    # Quad0 + nominal əvvəl; digər quad-lar sonra; raw axırda
    variants.sort(key=lambda t: (0 if t[0].startswith("fiducial_q0_") else (1 if t[0].startswith("fiducial_") else 2), t[3]))
    return variants


def _run_omr_once(
    sheet_bgr: np.ndarray,
    full_template: dict[str, Any],
    *,
    strip_crop: bool,
) -> tuple[pd.DataFrame | None, str]:
    """Bir OMRChecker keçidi. (df, detail_hint) qaytarır."""
    tpl = dict(full_template)
    if strip_crop:
        tpl["preProcessors"] = []
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / "inputs"
        out = Path(tmp) / "outputs"
        work.mkdir(parents=True)
        out.mkdir()
        (work / "template.json").write_text(json.dumps(tpl), encoding="utf-8")
        if not cv2.imwrite(str(work / "sheet.png"), sheet_bgr):
            return None, "imwrite_failed"
        _write_local_config(work, tpl)
        proc = _run_omrchecker_subprocess(work, out)
        if proc.returncode != 0:
            err_tail = (proc.stderr or proc.stdout or "")[-400:]
            return None, f"exit_{proc.returncode}:{err_tail}"
        results_csv = _find_results_csv(out)
        if results_csv is None:
            return None, "no_csv"
        try:
            df = pd.read_csv(results_csv)
        except Exception as err:  # noqa: BLE001
            return None, f"csv_read:{err}"
        if df.empty:
            return None, "empty_csv"
        return df, str(results_csv.name)


def _score_omr_attempt(
    answers: dict[str, str],
    multi_marked: int,
    alignment_failed: bool,
    q_count: int,
) -> tuple[float, float]:
    blank_ratio = _blank_ratio_questions(answers, q_count)
    confidence = max(0.0, min(1.0, 1.0 - 0.4 * blank_ratio))
    if alignment_failed:
        confidence = min(confidence, 0.25)
    if multi_marked > 0:
        confidence = min(confidence, 0.5)
    return blank_ratio, confidence


def _digit_code_score(answers: dict[str, str]) -> int:
    code = "".join(str(answers.get(f"id_student_code{i}") or "") for i in range(1, 7))
    return sum(1 for ch in code if ch.isdigit())


def _identity_letter_score(answers: dict[str, str]) -> int:
    score = 0
    for prefix, n in (("id_ad", 7), ("id_sn", 8), ("id_fn", 6)):
        for i in range(1, n + 1):
            v = str(answers.get(f"{prefix}{i:02d}") or answers.get(f"{prefix}{i}") or "").strip()
            if v and len(v) == 1:
                score += 1
    return score


def _intensity_decode_sheet(
    sheet_bgr: np.ndarray,
    full_template: dict[str, Any],
) -> dict[str, str]:
    """Template bubble koordinatlarında intensivlik zirvəsi ilə bütün sahələri oxu."""
    try:
        gray = cv2.cvtColor(sheet_bgr, cv2.COLOR_BGR2GRAY)
    except Exception:  # noqa: BLE001
        return {}
    bd = int((full_template.get("bubbleDimensions") or [28, 28])[0] or 28)
    r = max(5, bd // 2 - 3)
    out: dict[str, str] = {}
    blocks = full_template.get("fieldBlocks") or {}
    if not isinstance(blocks, dict):
        return out

    optional_meta = {"id_var", "id_grp", "id_sec", "id_lang"}

    def peak(ox: float, oy: float, i: int, j: int, lg: float, bg: float) -> float:
        cx = int(ox + i * lg + bd / 2)
        cy = int(oy + j * bg + bd / 2)
        patch = gray[max(0, cy - r) : cy + r, max(0, cx - r) : cx + r]
        return float(np.mean(patch)) if patch.size else 255.0

    for block in blocks.values():
        if not isinstance(block, dict):
            continue
        labels = block.get("fieldLabels") or []
        if isinstance(labels, str):
            labels = [labels]
        if not labels:
            continue
        values = block.get("bubbleValues")
        if not values:
            values = _FIELD_TYPE_DEFAULT_VALUES.get(str(block.get("fieldType") or ""), [])
        if not values:
            continue
        try:
            ox, oy = block.get("origin") or [0, 0]
            ox, oy = float(ox), float(oy)
            bg = float(block.get("bubblesGap") or 35)
            lg = float(block.get("labelsGap") or bg)
        except (TypeError, ValueError):
            continue
        for i, lab in enumerate(labels):
            key = str(lab)
            means: list[tuple[float, str]] = []
            for j, val in enumerate(values):
                means.append((peak(ox, oy, i, j, lg, bg), str(val)))
            means.sort(key=lambda t: t[0])
            if not means:
                continue
            dark, choice = means[0]
            margin = (means[1][0] - dark) if len(means) > 1 else 999.0
            second = means[1][0] if len(means) > 1 else 255.0
            third = means[2][0] if len(means) > 2 else 255.0
            is_q = bool(re.match(r"^q\d+$", key, re.I))
            is_meta = key in optional_meta
            if is_meta:
                # telefon: bir qədər yumşaq; In/Fr cütlüyündə üçüncü açıq olmalıdır
                ok = dark < 85 and margin > 45
                if (
                    not ok
                    and dark < 85
                    and margin > 18
                    and (third - dark) > 50
                    and second > dark + 15
                ):
                    ok = True
            elif is_q:
                # zəif margin (E/C kölgə cütlüyü) blank qalsın
                ok = dark < 150 and margin > 18
            else:
                # aydın tək hərф; Ş+A cütlüyü; telefonun solğun U işarəsi
                ok = dark < 135 and margin > 25
                if (
                    not ok
                    and dark < 70
                    and second < 100
                    and third > 130
                    and (third - dark) > 45
                ):
                    ok = True
                if (
                    not ok
                    and dark < 115
                    and margin > 15
                    and third > 140
                    and (third - dark) > 40
                ):
                    ok = True
            if not ok:
                continue
            out[key] = choice
            if is_q:
                out[f"Q{key[1:]}"] = choice
    return out


def _merge_intensity_answers(
    sheet_bgr: np.ndarray,
    full_template: dict[str, Any],
    answers: dict[str, str],
    *,
    override_questions: bool,
    output_columns: list[str],
) -> dict[str, str]:
    """OMR + intensity birləşdir: şəxsiyyət və (lazım olsa) MCQ üçün intensity üstün."""
    decoded = _intensity_decode_sheet(sheet_bgr, full_template)
    out = dict(answers)
    identity_keys = {
        k
        for k in output_columns
        if str(k).startswith("id_ad")
        or str(k).startswith("id_sn")
        or str(k).startswith("id_fn")
        or str(k).startswith("id_student_code")
        or str(k).startswith("id_sch")
        or str(k).startswith("id_cl")
    }
    meta_keys = {"id_var", "id_grp", "id_sec", "id_lang"}

    # Meta: yalnız intensity (OMR false-positive çox olur)
    for key in meta_keys:
        out[key] = str(decoded.get(key) or "")

    # Şəxsiyyət: intensity etibarlı kod oxuyubsa — intensity mənbədir (OMR qalığı silinsin)
    intensity_trust = _digit_code_score(decoded) >= 5
    for key in identity_keys:
        inten = str(decoded.get(key) or "").strip()
        if inten:
            out[key] = inten
        elif intensity_trust and str(key).startswith(("id_ad", "id_sn", "id_fn")):
            out[key] = ""

    # Suallar
    for col in output_columns:
        key = str(col)
        if not re.match(r"^q\d+$", key, re.I):
            continue
        inten = str(decoded.get(key) or "").strip()
        if override_questions:
            out[key] = inten
            out[f"Q{key[1:]}"] = inten
        elif inten and not str(out.get(key) or "").strip():
            out[key] = inten
            out[f"Q{key[1:]}"] = inten
    return out


def _count_filled_questions(answers: dict[str, str], q_count: int) -> int:
    n = 0
    for i in range(1, q_count + 1):
        v = answers.get(f"q{i}") or answers.get(f"Q{i}") or ""
        if str(v).strip():
            n += 1
    return n


def _mcq_agree_count(a: dict[str, str], b: dict[str, str], q_count: int) -> int:
    n = 0
    for i in range(1, q_count + 1):
        va = str(a.get(f"q{i}") or a.get(f"Q{i}") or "").strip().upper()[:1]
        vb = str(b.get(f"q{i}") or b.get(f"Q{i}") or "").strip().upper()[:1]
        if va and vb and va == vb:
            n += 1
    return n


def _name_quality_score(answers: dict[str, str]) -> int:
    """Xüsusi Azərbaycan hərfləri üstün; səhv warp-da uzun cəfəng hərflər cərimələnir."""
    specials = {"Ş", "Ə", "Ç", "Ö", "Ü", "Ğ", "İ"}
    score = 0
    for prefix, n in (("id_ad", 7), ("id_sn", 8), ("id_fn", 6)):
        chars = [str(answers.get(f"{prefix}{i:02d}") or "").strip() for i in range(1, n + 1)]
        contig: list[str] = []
        for ch in chars:
            if not ch:
                break
            contig.append(ch)
        # ilk boşdan sonrakı doldurulmuşlar — adətən səhv warp drift
        junk = sum(1 for ch in chars[len(contig) :] if ch)
        length = len(contig)
        if 1 <= length <= 5:
            score += length
        elif length > 5:
            score += 5 - (length - 5)
        score += sum(3 for ch in contig if ch in specials)
        score -= junk * 2
        # Uzun hərfsiz blok (BAAA/ACAAA) — skaner şəxsiyyətindən pis
        if length >= 4 and not any(ch in specials for ch in contig):
            score -= 3
        for i in range(len(contig) - 1):
            if contig[i] in specials and contig[i + 1] in {"S", "U", "A"}:
                score -= 3
    return score


def _intensity_rank_light(
    sheet_bgr: np.ndarray,
    full_template: dict[str, Any],
    q_count: int,
) -> tuple[int, int, int]:
    """Ranking/early-exit: MCQ filled + student_code digits + ad/soyad/fn name_q."""
    try:
        gray = cv2.cvtColor(sheet_bgr, cv2.COLOR_BGR2GRAY)
    except Exception:  # noqa: BLE001
        return 0, 0, 0
    bd = int((full_template.get("bubbleDimensions") or [28, 28])[0] or 28)
    r = max(5, bd // 2 - 3)
    blocks = full_template.get("fieldBlocks") or {}
    if not isinstance(blocks, dict):
        return 0, 0, 0

    def peak(ox: float, oy: float, i: int, j: int, lg: float, bg: float) -> float:
        cx = int(ox + i * lg + bd / 2)
        cy = int(oy + j * bg + bd / 2)
        patch = gray[max(0, cy - r) : cy + r, max(0, cx - r) : cx + r]
        return float(np.mean(patch)) if patch.size else 255.0

    filled = 0
    digits = 0
    letter_answers: dict[str, str] = {}
    for block in blocks.values():
        if not isinstance(block, dict):
            continue
        labels = block.get("fieldLabels") or []
        if isinstance(labels, str):
            labels = [labels]
        if not labels:
            continue
        values = block.get("bubbleValues")
        if not values:
            values = _FIELD_TYPE_DEFAULT_VALUES.get(str(block.get("fieldType") or ""), [])
        if not values:
            continue
        try:
            ox, oy = block.get("origin") or [0, 0]
            ox, oy = float(ox), float(oy)
            bg = float(block.get("bubblesGap") or 35)
            lg = float(block.get("labelsGap") or bg)
        except (TypeError, ValueError):
            continue
        for i, lab in enumerate(labels):
            key = str(lab)
            is_q = bool(re.match(r"^q\d+$", key, re.I))
            is_code = key.startswith("id_student_code")
            is_letter = key.startswith(("id_ad", "id_sn", "id_fn"))
            if not is_q and not is_code and not is_letter:
                continue
            means: list[tuple[float, str]] = []
            for j, val in enumerate(values):
                means.append((peak(ox, oy, i, j, lg, bg), str(val)))
            if not means:
                continue
            means.sort(key=lambda t: t[0])
            dark, choice = means[0]
            margin = (means[1][0] - dark) if len(means) > 1 else 999.0
            second = means[1][0] if len(means) > 1 else 255.0
            third = means[2][0] if len(means) > 2 else 255.0
            if is_q and dark < 150 and margin > 18:
                filled += 1
            elif is_code and dark < 145 and margin > 18:
                digits += 1
            elif is_letter:
                ok = dark < 135 and margin > 25
                if (
                    not ok
                    and dark < 70
                    and second < 100
                    and third > 130
                    and (third - dark) > 45
                ):
                    ok = True
                if (
                    not ok
                    and dark < 115
                    and margin > 15
                    and third > 140
                    and (third - dark) > 40
                ):
                    ok = True
                if ok:
                    letter_answers[key] = choice
    return min(filled, max(0, q_count)), digits, _name_quality_score(letter_answers)


def _variant_good_enough(
    *,
    q_count: int,
    digit_score: int,
    intensity_digits: int,
    agree_proxy: int,
    filled: int,
    intensity_filled: int,
    multi_marked: int,
    name_q: int,
    inset_pen: int,
) -> bool:
    """Yüksək güvənli namizəd — qalan variantlara ehtiyac yoxdur.

    name_q intensity hərf skoru olmalıdır (OMR Ş-ni çox vaxt blank edir).
    Səhv inset-də MCQ+kod dolu ola bilər, amma ad keyfiyyəti düşür (BAŞ→BAA).
    """
    digits = max(digit_score, intensity_digits)
    filled_eff = max(filled, intensity_filled) if intensity_filled <= filled + 1 else filled
    if digits < 6:
        return False
    if multi_marked > max(3, q_count // 10):
        return False
    need = max(1, int(q_count * 0.85))
    if agree_proxy < need and filled_eff < need:
        return False
    # En azı aydın ad/soyad/fn (xüsusi hərf bonuslu ≈ BAŞ+ABA+AUA ≈ 11)
    if name_q < 11:
        return False
    if inset_pen > 4:
        return False
    return True


def process_omr(image_bytes: bytes, template_config: dict[str, Any]) -> dict[str, Any]:
    # Worker artıq QR oxuyubsa təkrar skanı atla
    skip_qr = bool(template_config.get("_skip_qr"))
    hint_uuid = template_config.get("_sheet_uuid_hint")
    hint_exam = template_config.get("_exam_id_hint")
    if skip_qr and (hint_uuid or hint_exam is not None):
        sheet_uuid = str(hint_uuid).strip() if hint_uuid else None
        try:
            exam_id_from_qr = int(hint_exam) if hint_exam is not None else None
        except (TypeError, ValueError):
            exam_id_from_qr = None
        qr_raw = None
    else:
        qr_raw = _read_qr(image_bytes)
        sheet_uuid, exam_id_from_qr = _parse_qr(qr_raw)
        if hint_uuid and not sheet_uuid:
            sheet_uuid = str(hint_uuid).strip() or None
        if exam_id_from_qr is None and hint_exam is not None:
            try:
                exam_id_from_qr = int(hint_exam)
            except (TypeError, ValueError):
                pass

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

    page_dims = full_template.get("pageDimensions") or [2480, 3508]
    variants = _prepare_sheet_variants(image_bytes, page_dims if isinstance(page_dims, list) else [2480, 3508])
    if not variants:
        return _heuristic_fallback(
            image_bytes, q_count, "Invalid image", sheet_uuid, exam_id_from_qr, as_error=True
        )

    early_exit = _env_flag("OMR_EARLY_EXIT", True)
    max_variants = _env_int("OMR_MAX_VARIANTS", 0)

    value_sets = _field_label_value_sets(full_template)
    best: dict[str, Any] | None = None
    # köhnə 3-tuple formatına tolerans
    normalized_variants: list[tuple[str, np.ndarray, bool, int]] = []
    for item in variants:
        if len(item) == 4:
            normalized_variants.append(item)  # type: ignore[arg-type]
        else:
            label, sheet_bgr, strip_crop = item  # type: ignore[misc]
            normalized_variants.append((label, sheet_bgr, strip_crop, 0))
    if max_variants > 0:
        normalized_variants = normalized_variants[:max_variants]

    tried = 0
    for _label, sheet_bgr, strip_crop, inset_pen in normalized_variants:
        tried += 1
        df, hint = _run_omr_once(sheet_bgr, full_template, strip_crop=strip_crop)
        if df is None:
            continue
        try:
            answers, multi_marked = _parse_results_dataframe(df, out_cols, value_sets)
            if _answers_look_like_header_spill(answers, out_cols):
                continue
        except Exception:  # noqa: BLE001
            continue
        alignment_failed = _alignment_failed_row(df)
        blank_ratio, confidence = _score_omr_attempt(answers, multi_marked, alignment_failed, q_count)
        filled = _count_filled_questions(answers, q_count)
        digit_score = _digit_code_score(answers)
        letter_score = _identity_letter_score(answers)
        # Ranking: yüngül intensity (tam decode yalnız qalibdə)
        intensity_filled, intensity_digits, inten_name_q = _intensity_rank_light(
            sheet_bgr, full_template, q_count
        )
        agree = min(filled, intensity_filled)  # proxy razılıq
        name_q = inten_name_q
        candidate = {
            "answers": answers,
            "confidence": round(confidence, 4),
            "multi_marked": multi_marked,
            "blank_ratio": round(blank_ratio, 4),
            "alignment_failed": alignment_failed,
            "filled": filled,
            "digit_score": digit_score,
            "letter_score": letter_score,
            "intensity_filled": intensity_filled,
            "intensity_digits": intensity_digits,
            "agree": agree,
            "name_q": name_q,
            "inset_pen": int(inset_pen),
            "hint": hint,
            "sheet_bgr": sheet_bgr,
        }
        cand_key = (
            max(digit_score, intensity_digits),
            name_q,
            agree,
            -multi_marked,
            max(filled, intensity_filled) if intensity_filled <= filled + 1 else filled,
            -int(inset_pen),
            confidence,
        )
        best_key = (
            (
                max(best["digit_score"], best["intensity_digits"]),
                best["name_q"],
                best["agree"],
                -best["multi_marked"],
                max(best["filled"], best["intensity_filled"])
                if best["intensity_filled"] <= best["filled"] + 1
                else best["filled"],
                -best["inset_pen"],
                best["confidence"],
            )
            if best is not None
            else None
        )
        if best is None or cand_key > best_key:
            best = candidate
            # Ən azı bir neçə namizəd sınansın (telefon digər quad/inset istəyə bilər)
            if (
                early_exit
                and tried >= 4
                and _variant_good_enough(
                    q_count=q_count,
                    digit_score=digit_score,
                    intensity_digits=intensity_digits,
                    agree_proxy=agree,
                    filled=filled,
                    intensity_filled=intensity_filled,
                    multi_marked=multi_marked,
                    name_q=name_q,
                    inset_pen=int(inset_pen),
                )
            ):
                break

    if best is None:
        return _heuristic_fallback(
            image_bytes,
            q_count,
            "OMRChecker nəticə vermədi",
            sheet_uuid,
            exam_id_from_qr,
            as_error=True,
        )

    # Qalibdə tam intensity + name_q yenilə
    full_intensity = _intensity_decode_sheet(best["sheet_bgr"], full_template)
    best["intensity_filled"] = _count_filled_questions(full_intensity, q_count)
    best["intensity_digits"] = _digit_code_score(full_intensity)
    best["name_q"] = _name_quality_score(full_intensity)
    best["agree"] = _mcq_agree_count(best["answers"], full_intensity, q_count)

    override_q = int(best["multi_marked"]) > max(3, q_count // 10) or int(best["filled"]) < int(
        best["intensity_filled"]
    )
    answers = _merge_intensity_answers(
        best["sheet_bgr"],
        full_template,
        best["answers"],
        override_questions=override_q,
        output_columns=out_cols,
    )

    multi_marked = 0
    for col in out_cols:
        key = str(col)
        allowed = value_sets.get(key)
        val = str(answers.get(key) or "")
        if allowed is not None and val and val not in allowed:
            answers[key] = "MULTI"
            m = re.match(r"^q(\d+)$", key, re.I)
            if m:
                answers[f"Q{m.group(1)}"] = "MULTI"
            multi_marked += 1
    blank_ratio, confidence = _score_omr_attempt(
        answers, multi_marked, bool(best["alignment_failed"]), q_count
    )
    alignment_failed = bool(best["alignment_failed"])
    status = "ok" if confidence >= 0.85 and not alignment_failed and multi_marked == 0 else "manual_review"
    detail = "omrchecker"
    if override_q:
        detail = "omrchecker_intensity_refine"
    if multi_marked > 0:
        detail = "omrchecker_multi_marked"
    if alignment_failed:
        detail = "omrchecker_alignment_failed"
    return {
        "answers": answers,
        "confidence": round(confidence, 4),
        "status": status,
        "multi_marked": multi_marked,
        "blank_ratio": round(blank_ratio, 4),
        "detail": detail,
        "sheet_uuid": sheet_uuid,
        "exam_id_from_qr": exam_id_from_qr,
    }
