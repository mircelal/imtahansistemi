"""
Skan nəticəsi üçün kanonik JSON (OMR oxunuşu) — xarici sistemlərə aktarma.

Əl yazısı daxil deyil; yalnız `detected_answers` içindəki kodlanmış dəyərlər (MCQ, id_*).
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from app.models.entities import AnswerKey, Exam, ScanResult, ScanSession
from app.services.dim_identity import resolve_identity_fields


READING_VERSION = "1"


def parse_omr_qr_payload(qr_raw: str | None) -> dict[str, Any]:
    """
    QR mətni: `omr:v1:{sheet_uuid}:{exam_id}` və ya boş.
    """
    out: dict[str, Any] = {
        "qr_raw": (qr_raw or "").strip() or None,
        "format": None,
        "sheet_uuid": None,
        "exam_id": None,
        "extras": None,
    }
    raw = out["qr_raw"]
    if not raw:
        return out
    parts = raw.split(":")
    if len(parts) >= 4 and parts[0] == "omr" and parts[1] == "v1":
        out["format"] = "omr:v1"
        out["sheet_uuid"] = parts[2] or None
        try:
            out["exam_id"] = int(parts[3])
        except (TypeError, ValueError):
            out["exam_id"] = None
        if len(parts) > 4:
            tail = parts[4:]
            out["extras"] = tail
            if len(tail) >= 2 and tail[0].lower() == "ticket":
                out["ticket"] = ":".join(tail[1:]) if len(tail) > 2 else (tail[1] or None)
    return out


def split_detected_answers(raw: dict[str, Any] | None) -> tuple[dict[str, Any], dict[str, str], dict[str, str]]:
    """
    Returns: (meta, identity, mcq) — meta: __* və naməlum açarlar saxlanıla bilər.
    """
    raw = raw or {}
    meta: dict[str, Any] = {}
    identity: dict[str, str] = {}
    mcq: dict[str, str] = {}
    for k, v in raw.items():
        ks = str(k).strip()
        if ks.startswith("__"):
            meta[ks] = v
            continue
        if ks.startswith("id_"):
            identity[ks] = "" if v is None else str(v).strip()
            continue
        m = re.match(r"^q?(\d+)$", ks, re.IGNORECASE)
        if m:
            num = m.group(1)
            val = "" if v is None else str(v).strip()
            mcq[f"Q{num}"] = val
            continue
        meta[ks] = v
    return meta, identity, mcq


def build_identity_key_labels(template_config: dict[str, Any] | None) -> dict[str, str]:
    """
    OMR sütun adı (id_*) → insan oxunuşlu etiket (şablon identity_fields əsasında).
    """
    if not template_config:
        return {}
    cfg = dict(template_config)
    labels: dict[str, str] = {}
    for f in resolve_identity_fields(cfg):
        kind = f.get("kind")
        if kind == "digit_groups":
            for g in f.get("groups") or []:
                gid = str(g.get("id", "d"))
                glabel = str(g.get("label", gid))
                cnt = int(g.get("count", 1))
                for j in range(cnt):
                    labels[f"id_{gid}{j + 1}"] = f"{glabel} — rəqəm {j + 1}"
        elif kind == "mcq_groups":
            for g in f.get("groups") or []:
                gid = str(g.get("id", "mcq"))
                glabel = str(g.get("label", gid))
                labels[f"id_{gid}"] = glabel
        elif kind == "horizontal_letters":
            fid = str(f.get("id", "hl"))
            flabel = str(f.get("label", "Hərf"))
            nrows = int(f.get("rows", 8))
            for ri in range(nrows):
                labels[f"id_{fid}{ri + 1:02d}"] = f"{flabel} — sətir {ri + 1:02d}"
        elif kind == "vertical_letters":
            fid = str(f.get("id", "vl"))
            flabel = str(f.get("label", "Sütun"))
            ncol = int(f.get("columns", 12))
            for j in range(ncol):
                labels[f"id_{fid}{j + 1:02d}"] = f"{flabel} — sütun {j + 1:02d}"
        elif kind == "digits":
            gid = str(f.get("id", "num"))
            glabel = str(f.get("label", "Rəqəm"))
            cnt = int(f.get("count", 6))
            for j in range(cnt):
                labels[f"id_{gid}{j + 1}"] = f"{glabel} — rəqəm {j + 1}"
        elif kind == "mcq":
            gid = str(f.get("id", "one"))
            glabel = str(f.get("label", "Seçim"))
            labels[f"id_{gid}"] = glabel
    return labels


def build_effective_answer_key(
    keys: list[AnswerKey],
    sheet_answer_key: dict[str, Any] | None,
) -> dict[str, str]:
    """Sheet açarı + əsas açar birləşməsi (sheet üstünlük)."""
    out: dict[str, str] = {}
    for k in sorted(keys, key=lambda x: x.question_number):
        ca = (k.correct_answer or "").strip().upper()
        if ca:
            out[str(k.question_number)] = ca
    if sheet_answer_key and isinstance(sheet_answer_key, dict):
        raw = sheet_answer_key.get("answers") if "answers" in sheet_answer_key else sheet_answer_key
        if isinstance(raw, dict):
            for ks, ca in raw.items():
                ca_u = str(ca).strip().upper()
                if ca_u:
                    out[str(ks)] = ca_u
    return out


def build_scan_reading_dict(
    *,
    result: ScanResult,
    session: ScanSession,
    exam: Exam,
    template_config: dict[str, Any] | None,
    qr_raw_hint: str | None = None,
    answer_keys: list[AnswerKey] | None = None,
) -> dict[str, Any]:
    raw = dict(result.detected_answers or {})
    meta, identity, mcq = split_detected_answers(raw)
    sheet_uuid = None
    if isinstance(meta.get("__sheet_uuid__"), str):
        sheet_uuid = meta["__sheet_uuid__"].strip() or None
    qr_hint = qr_raw_hint
    if not qr_hint and isinstance(meta.get("__qr_raw__"), str):
        qr_hint = meta["__qr_raw__"].strip() or None
    qr = parse_omr_qr_payload(qr_hint)
    if sheet_uuid and not qr.get("sheet_uuid"):
        qr["sheet_uuid"] = sheet_uuid
    if exam.id and not qr.get("exam_id"):
        qr["exam_id"] = exam.id
    if sheet_uuid and qr.get("exam_id") is not None and not qr.get("qr_raw"):
        qr["qr_raw"] = f"omr:v1:{sheet_uuid}:{qr['exam_id']}"

    field_labels = build_identity_key_labels(template_config)
    for k in identity:
        if k not in field_labels:
            field_labels[k] = k

    st = result.status
    status_s = st.value if hasattr(st, "value") else str(st)

    hints: dict[str, Any] = {}
    sheet_key_raw = None
    if template_config:
        if template_config.get("omr_two_page_stitched"):
            hints["omr_two_page_stitched"] = True
        if template_config.get("single_page_layout") is False:
            hints["single_page_layout"] = False
        sk = template_config.get("sheet_answer_key")
        sheet_key_raw = sk if isinstance(sk, dict) else None

    effective_answer_key: dict[str, str] | None = None
    if answer_keys:
        effective_answer_key = build_effective_answer_key(answer_keys, sheet_key_raw)

    out: dict[str, Any] = {
        "version": READING_VERSION,
        "scan_result_id": result.id,
        "session_id": session.id,
        "exam_id": exam.id,
        "exam_title": exam.title,
        "sheet_uuid": sheet_uuid,
        "qr": qr,
        "scores": {"score": result.score, "max_score": result.max_score},
        "status": status_s,
        "error_message": result.error_message,
        "image_path": result.image_path,
        "processed_at": result.processed_at.isoformat() if result.processed_at else None,
        "field_labels": field_labels,
        "identity": identity,
        "mcq": dict(sorted(mcq.items(), key=lambda kv: int(re.sub(r"\D", "", kv[0]) or 0))),
        "meta": meta,
        "raw_detected": raw,
        "template_hints": hints or None,
        "effective_answer_key": effective_answer_key,
    }
    return out
