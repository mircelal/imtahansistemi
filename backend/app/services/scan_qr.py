"""Cavab kartı QR oxunması — OMR servisi vasitəsilə."""

from __future__ import annotations

import zipfile
from io import BytesIO
from typing import Any

import httpx

from app.config import get_settings
from app.services.scan_reading_payload import parse_omr_qr_payload

_IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif")
_MAX_ZIP_MEMBERS = 500
_MAX_ZIP_UNCOMPRESSED_BYTES = 500 * 1024 * 1024
_MAX_ZIP_COMPRESSION_RATIO = 200


def read_qr_from_image_bytes(image_bytes: bytes) -> dict[str, Any]:
    """OMR mikroservisindən QR oxu; boş dict xəta zamanı."""
    settings = get_settings()
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.post(
                f"{settings.omr_service_url}/qr",
                files={"file": ("scan.jpg", image_bytes, "image/jpeg")},
            )
            r.raise_for_status()
            data = r.json()
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def qr_meta_from_service_response(raw: dict[str, Any]) -> dict[str, Any]:
    """OMR /qr cavabını vahid struktura çevir."""
    qr_raw = str(raw.get("qr_raw") or "").strip() or None
    parsed = parse_omr_qr_payload(qr_raw)
    sheet_uuid = raw.get("sheet_uuid") or parsed.get("sheet_uuid")
    exam_id = raw.get("exam_id_from_qr")
    if exam_id is None:
        exam_id = parsed.get("exam_id")
    try:
        exam_id = int(exam_id) if exam_id is not None else None
    except (TypeError, ValueError):
        exam_id = None
    return {
        "qr_raw": qr_raw,
        "sheet_uuid": str(sheet_uuid).strip() if sheet_uuid else None,
        "exam_id": exam_id,
        "format": parsed.get("format"),
    }


def _iter_zip_images(data: bytes) -> list[tuple[str, bytes]]:
    out: list[tuple[str, bytes]] = []
    with zipfile.ZipFile(BytesIO(data)) as zf:
        infos = [i for i in zf.infolist() if not i.is_dir()]
        if len(infos) > _MAX_ZIP_MEMBERS:
            raise ValueError(f"ZIP çox fayl ehtiva edir (>{_MAX_ZIP_MEMBERS})")
        total = sum(i.file_size for i in infos)
        if total > _MAX_ZIP_UNCOMPRESSED_BYTES:
            raise ValueError("ZIP çıxarılmış ölçü həddi keçir")
        compressed = sum(i.compress_size for i in infos)
        if compressed > 0 and total / compressed > _MAX_ZIP_COMPRESSION_RATIO:
            raise ValueError("ZIP sıxılma nisbəti həddindən yüksəkdir")
        for info in infos:
            if info.filename.lower().endswith(_IMAGE_EXT):
                out.append((info.filename, zf.read(info.filename)))
    return out


def detect_exam_id_from_uploads(files: list[tuple[str, bytes]]) -> dict[str, Any] | None:
    """
    Yüklənən fayllardan (şəkil və ya ZIP daxilindəki şəkillər) QR oxuyub exam_id tap.
    İlk uğurlu oxunuş qaytarılır.
    """
    candidates: list[tuple[str, bytes]] = []
    for name, body in files:
        lower = name.lower()
        if lower.endswith(".zip"):
            try:
                candidates.extend(_iter_zip_images(body))
            except ValueError:
                continue
        elif lower.endswith(_IMAGE_EXT):
            candidates.append((name, body))

    for name, body in candidates:
        if not body:
            continue
        meta = qr_meta_from_service_response(read_qr_from_image_bytes(body))
        if meta.get("exam_id"):
            meta["source_file"] = name
            return meta
    return None
