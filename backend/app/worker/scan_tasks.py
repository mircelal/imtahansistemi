import json
import re
import uuid
import zipfile
from datetime import datetime
from io import BytesIO
from typing import Any

import httpx
from sqlalchemy import delete, select

from app.celery_worker import celery_app
from app.config import get_settings
from app.database_sync import SyncSessionLocal
from app.models.entities import (
    AnswerKey,
    AnswerSheetTemplate,
    Exam,
    ManualCorrection,
    ResultStatus,
    ScanResult,
    ScanSession,
    SessionStatus,
)
from app.services.pdf_generator import get_omr_template
from app.services.scan_scoring import merge_corrected_mcqs, score_exam
from app.services.student_resolve import (
    resolve_student_id_from_scan,
    template_expects_student_code,
)
from app.services.storage import StorageService
from app.worker.scan_session_lock import (
    acquire_scan_session_lock,
    extend_scan_session_lock,
    force_acquire_scan_session_lock,
    is_scan_session_locked,
    mark_scan_session_reprocess_pending,
    pop_scan_session_reprocess_pending,
    release_scan_session_lock,
)

settings = get_settings()

QR_FALLBACK_NOTICE = (
    "QR oxunmadı — son təsdiqlənmiş cavab kartı şablonu ilə emal edildi. "
    "Ekran görüntüsü yox, çap edilmiş kartın tam skan/fotosunu yükləyin (aşağı sağ küncdə QR görünməlidir)."
)

MAX_ZIP_MEMBERS = 500
MAX_ZIP_UNCOMPRESSED_BYTES = 500 * 1024 * 1024
MAX_ZIP_COMPRESSION_RATIO = 100

_IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif")


def _normalize_image_bytes_for_omr(image_bytes: bytes) -> bytes:
    """Telefon şəkilləri (WebP, PNG, HEIC/HEIF, …) OMR üçün JPEG-ə çevirir."""
    from io import BytesIO

    from PIL import Image, UnidentifiedImageError

    try:
        import pillow_heif  # type: ignore[import-untyped]

        pillow_heif.register_heif_opener()
    except ImportError:
        pass

    try:
        im = Image.open(BytesIO(image_bytes))
    except (UnidentifiedImageError, OSError):
        return image_bytes
    try:
        if im.mode in ("RGBA", "P"):
            im = im.convert("RGB")
        elif im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        if im.mode == "L":
            im = im.convert("RGB")
        out = BytesIO()
        im.save(out, format="JPEG", quality=92)
        return out.getvalue()
    except Exception:  # noqa: BLE001
        return image_bytes


def _call_omr(image_bytes: bytes, template: dict[str, Any]) -> dict[str, Any]:
    """
    OMR servisinə şəkli göndər.
    template — tam OMRChecker template (get_omr_template() vasitəsilə hazırlanmış).
    Nəticədə sheet_uuid və exam_id_from_qr sahələri də ola bilər.
    """
    with httpx.Client(timeout=120.0) as client:
        files = {"file": ("scan.jpg", image_bytes, "image/jpeg")}
        data  = {"template_config": json.dumps(template)}
        r = client.post(f"{settings.omr_service_url}/process", files=files, data=data)
        r.raise_for_status()
        return r.json()


def _read_qr_from_omr_service(image_bytes: bytes) -> dict[str, Any]:
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.post(
                f"{settings.omr_service_url}/qr",
                files={"file": ("scan.jpg", image_bytes, "image/jpeg")},
            )
            r.raise_for_status()
            data = r.json()
            return data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def _invalidate_stale_omr_template_cfg(cfg: dict[str, Any]) -> dict[str, Any]:
    """Yalnız açıq stale flag olduqda saxlanmış OMR şablonunu sil (HTTP endpoint ilə eyni)."""
    if cfg.get("_omr_template_stale"):
        cfg.pop("omr_template", None)
        cfg.pop("_omr_template_stale", None)
    return cfg


def _natural_sort_key(name: str) -> list[Any]:
    parts = re.split(r"(\d+)", name.replace("\\", "/"))
    out: list[Any] = []
    for p in parts:
        if p.isdigit():
            out.append(int(p))
        elif p:
            out.append(p.lower())
    return out


def _stitch_group_base(name: str) -> str:
    lower = name.lower().replace("\\", "/")
    for token in (
        "page1",
        "page_1",
        "page-1",
        "p1",
        "səhifə1",
        "sheet1",
        "page2",
        "page_2",
        "page-2",
        "p2",
        "səhifə2",
        "sheet2",
    ):
        lower = lower.replace(token, "")
    return re.sub(r"[_\-.]+", "_", lower).strip("_")


def _pair_collected_for_stitch(
    collected: list[tuple[str, bytes]],
) -> list[tuple[str, bytes, str | None, bytes | None]]:
    """Səhifə ipucları + natural sort ilə 2-səhifəli cütlər."""
    by_group: dict[str, dict[int, tuple[str, bytes]]] = {}
    unhinted: list[tuple[str, bytes]] = []
    for name, data in collected:
        hint = _page_hint_from_filename(name)
        if hint in (1, 2):
            base = _stitch_group_base(name)
            by_group.setdefault(base, {})[hint] = (name, data)
        else:
            unhinted.append((name, data))

    pairs: list[tuple[str, bytes, str | None, bytes | None]] = []
    for base in sorted(by_group.keys(), key=_natural_sort_key):
        pages = by_group[base]
        if 1 in pages and 2 in pages:
            t1, b1 = pages[1]
            t2, b2 = pages[2]
            pairs.append((t1, b1, t2, b2))
        elif 1 in pages:
            t, b = pages[1]
            pairs.append((t, b, None, None))
        elif 2 in pages:
            t, b = pages[2]
            pairs.append((t, b, None, None))

    unhinted.sort(key=lambda x: _natural_sort_key(x[0]))
    i = 0
    while i < len(unhinted):
        if i + 1 < len(unhinted):
            n1, b1 = unhinted[i]
            n2, b2 = unhinted[i + 1]
            pairs.append((n1, b1, n2, b2))
            i += 2
        else:
            n, b = unhinted[i]
            pairs.append((n, b, None, None))
            i += 1
    return pairs


def _correction_restore_key(detected: dict[str, Any] | None, student_id: int | None) -> str:
    """Manual düzəliş bərpası — image_path deyil, sheet_uuid + şagird."""
    det = detected or {}
    su = str(det.get("__sheet_uuid__") or "").strip()
    if student_id is not None and su:
        return f"{su}|sid:{int(student_id)}"
    digits: list[str] = []
    for i in range(1, 7):
        v = det.get(f"id_student_code{i}")
        if v is not None and str(v).strip():
            digits.append(str(v).strip())
    code = "".join(digits)
    if su and code:
        return f"{su}|code:{code}"
    if su:
        return f"{su}|anon"
    return ""


def _save_stitched_image(storage: StorageService, bucket: str, session_id: int, merged: bytes) -> str:
    key = f"scans/{session_id}/stitched/{uuid.uuid4().hex}.jpg"
    storage.upload_bytes(bucket, key, merged, "image/jpeg")
    return key


def _page_hint_from_filename(name: str) -> int | None:
    lower = name.lower().replace("\\", "/")
    p2 = ("page2", "page_2", "p2", "səhifə2", "sheet2", "_2.", "-2.", "_2_", "-2-")
    p1 = ("page1", "page_1", "p1", "səhifə1", "sheet1", "_1.", "-1.", "_1_", "-1-")
    if any(t in lower for t in p2):
        return 2
    if any(t in lower for t in p1):
        return 1
    return None


def _scan_image_allowed_for_template(name: str, cfg: dict[str, Any]) -> bool:
    """İki səhifə + stitched deyil: yalnız MCQ (2-ci) səhifə şəkilləri."""
    if cfg.get("single_page_layout") is not False:
        return True
    if bool(cfg.get("omr_two_page_stitched")):
        return True
    hint = _page_hint_from_filename(name)
    if hint == 1:
        return False
    return True


def _stitch_images_vertical(top: bytes, bottom: bytes) -> bytes:
    from PIL import Image

    im1 = Image.open(BytesIO(top)).convert("RGB")
    im2 = Image.open(BytesIO(bottom)).convert("RGB")
    w = max(im1.width, im2.width)
    h = im1.height + im2.height
    out = Image.new("RGB", (w, h), (255, 255, 255))
    out.paste(im1, (0, 0))
    out.paste(im2, (0, im1.height))
    buf = BytesIO()
    out.save(buf, format="JPEG", quality=92)
    return buf.getvalue()


def _sheet_cfg_for_omr_recompute(cfg: dict[str, Any]) -> dict[str, Any]:
    """Saxlanmış omr_template köhnə ola bilər; layout həmişə cari get_omr_template ilə hesablanır."""
    return {k: v for k, v in dict(cfg).items() if k != "omr_template"}


def _template_for_sheet_row(row: AnswerSheetTemplate | None, db: Any, exam: Exam) -> dict[str, Any]:
    if row and row.template_config:
        cfg = dict(row.template_config)
        return get_omr_template(_sheet_cfg_for_omr_recompute(cfg))
    return _get_omr_template_for_exam(db, exam)


def _get_omr_template_for_exam(db: Any, exam: Exam) -> dict[str, Any]:
    """
    Exam üçün OMR template-i qaytarır.
    Əgər AnswerSheetTemplate-də saxlanılmış omr_template varsa onu istifadə edir,
    yoxdursa exam konfiqurasiyasından hesablayır.
    """
    latest_sheet = db.scalar(
        select(AnswerSheetTemplate)
        .where(
            AnswerSheetTemplate.exam_id == exam.id,
            AnswerSheetTemplate.is_draft.is_(False),
            AnswerSheetTemplate.pdf_path.is_not(None),
        )
        .order_by(AnswerSheetTemplate.id.desc())
    )
    if latest_sheet and latest_sheet.template_config:
        cfg = dict(latest_sheet.template_config)
        return get_omr_template(_sheet_cfg_for_omr_recompute(cfg))

    # Fallback: exam-dən əsas konfiqurasiya
    exam_cfg = {
        "question_count":     exam.question_count,
        "options_per_question": exam.options_per_question,
        "columns_count":      getattr(exam, "columns_count", 2),
        "paper_size":         "A4",
    }
    return get_omr_template(exam_cfg)


def _latest_template_config_for_exam(db: Any, exam_id: int) -> dict[str, Any]:
    latest = db.scalar(
        select(AnswerSheetTemplate)
        .where(
            AnswerSheetTemplate.exam_id == exam_id,
            AnswerSheetTemplate.is_draft.is_(False),
            AnswerSheetTemplate.pdf_path.is_not(None),
        )
        .order_by(AnswerSheetTemplate.id.desc())
    )
    if latest and latest.template_config:
        return dict(latest.template_config)
    return {}


def _latest_confirmed_sheet_row(db: Any, exam_id: int) -> AnswerSheetTemplate | None:
    return db.scalar(
        select(AnswerSheetTemplate)
        .where(
            AnswerSheetTemplate.exam_id == exam_id,
            AnswerSheetTemplate.is_draft.is_(False),
            AnswerSheetTemplate.pdf_path.is_not(None),
        )
        .order_by(AnswerSheetTemplate.id.desc())
    )


def _template_config_for_sheet_uuid(db: Any, exam_id: int, sheet_uuid: str) -> dict[str, Any]:
    row = db.scalar(
        select(AnswerSheetTemplate).where(
            AnswerSheetTemplate.exam_id == exam_id,
            AnswerSheetTemplate.sheet_uuid == str(sheet_uuid),
            AnswerSheetTemplate.is_draft.is_(False),
        )
    )
    if row and row.template_config:
        return dict(row.template_config)
    return {}


def _resolve_image_template_config(
    db: Any, exam_id: int, image_bytes: bytes, fallback: dict[str, Any]
) -> tuple[dict[str, Any], str | None]:
    """
    QR/sheet_uuid ilə şablon həll et.
    Qaytarır: (cfg, error_message). error_message dolu olanda fallback ilə OMR etmə.
    """
    normalized = _normalize_image_bytes_for_omr(image_bytes)
    qr_meta = _read_qr_from_omr_service(normalized)
    su = qr_meta.get("sheet_uuid")
    if not su:
        if fallback:
            return fallback, None
        return fallback, "QR oxunmadı — təsdiqlənmiş cavab kartı tapılmadı"
    cfg = _template_config_for_sheet_uuid(db, exam_id, str(su))
    if cfg:
        return cfg, None
    return fallback, f"Naməlum vərəq (sheet_uuid={su}) — şablon tapılmadı"


def _snapshot_session_corrections(db: Any, session_id: int) -> dict[str, list[dict[str, Any]]]:
    """sheet_uuid+şagird açarı → manual düzəlişlər (yenidən emalda bərpa üçün)."""
    rows = list(
        db.scalars(select(ScanResult).where(ScanResult.session_id == session_id).order_by(ScanResult.id)).all()
    )
    out: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        corrections = list(
            db.scalars(
                select(ManualCorrection)
                .where(ManualCorrection.scan_result_id == row.id)
                .order_by(ManualCorrection.id)
            ).all()
        )
        if not corrections:
            continue
        restore_key = _correction_restore_key(row.detected_answers or {}, row.student_id)
        if not restore_key:
            restore_key = row.image_path
        out[restore_key] = [
            {
                "corrected_answers": dict(c.corrected_answers or {}),
                "corrected_by": int(c.corrected_by),
            }
            for c in corrections
        ]
    return out


def _reapply_session_corrections(session_id: int, snapshot: dict[str, list[dict[str, Any]]]) -> None:
    if not snapshot:
        return
    with SyncSessionLocal() as db:
        session = db.get(ScanSession, session_id)
        if session is None:
            return
        exam = db.get(Exam, session.exam_id)
        if exam is None:
            return
        keys = list(
            db.scalars(
                select(AnswerKey).where(AnswerKey.exam_id == exam.id).order_by(AnswerKey.question_number)
            ).all()
        )
        results = list(
            db.scalars(select(ScanResult).where(ScanResult.session_id == session_id).order_by(ScanResult.id)).all()
        )
        for row in results:
            merged_probe = dict(row.detected_answers or {})
            restore_key = _correction_restore_key(merged_probe, row.student_id) or row.image_path
            entries = snapshot.get(restore_key)
            if not entries:
                continue
            merged = dict(row.detected_answers or {})
            for entry in entries:
                merged = merge_corrected_mcqs(merged, entry.get("corrected_answers") or {})

            sheet_key = None
            tpl_cfg = None
            su = merged.get("__sheet_uuid__")
            if su:
                sheet_row = db.scalar(
                    select(AnswerSheetTemplate).where(
                        AnswerSheetTemplate.exam_id == exam.id,
                        AnswerSheetTemplate.sheet_uuid == str(su),
                        AnswerSheetTemplate.is_draft.is_(False),
                    )
                )
                if sheet_row and sheet_row.template_config:
                    tpl_cfg = dict(sheet_row.template_config)
                    sk = tpl_cfg.get("sheet_answer_key")
                    sheet_key = sk if isinstance(sk, dict) else None

            score_v, max_v, breakdown = score_exam(
                merged, keys, exam, sheet_answer_key=sheet_key
            )
            if max_v <= 0 and row.max_score is not None:
                max_v = float(row.max_score)

            new_sid, st_reason = resolve_student_id_from_scan(db, exam, merged, tpl_cfg)
            row.detected_answers = merged
            row.score = score_v
            row.max_score = max_v
            row.score_breakdown = breakdown or None
            row.student_id = new_sid
            if new_sid is None:
                row.status = ResultStatus.MANUAL_REVIEW
                if template_expects_student_code(tpl_cfg):
                    hint = (
                        "Şagird kodu kartda tam doldurulmayıb"
                        if st_reason == "student_code_incomplete"
                        else "Bu kursda həmin 6 rəqəmli kodlu şagird yoxdur"
                    )
                    prev = row.error_message or ""
                    row.error_message = f"{prev}; {hint}" if prev and hint not in prev else (prev or hint)
                else:
                    row.error_message = row.error_message or "Şagird təyin edilməyib"
            else:
                row.status = ResultStatus.OK
                row.error_message = None

            for entry in entries:
                db.add(
                    ManualCorrection(
                        scan_result_id=row.id,
                        corrected_answers=entry.get("corrected_answers") or {},
                        corrected_by=int(entry["corrected_by"]),
                    )
                )
        db.commit()


def _sync_session_progress(
    session_id: int,
    processed: int,
    *,
    status: SessionStatus | None = None,
    total: int | None = None,
) -> None:
    """UI faizi — hər kart emal olunanda yenilənir (yalnız job sonunda deyil)."""
    with SyncSessionLocal() as db:
        s = db.get(ScanSession, session_id)
        if s is None:
            return
        s.processed_images = processed
        if total is not None:
            s.total_images = total
        if status is not None:
            s.status = status
        elif s.status == SessionStatus.PENDING:
            s.status = SessionStatus.PROCESSING
        db.commit()


def _max_score_for_exam(db: Any, exam_id: int) -> float:
    exam = db.get(Exam, exam_id)
    if exam is None:
        return 0.0
    keys = list(
        db.scalars(
            select(AnswerKey).where(AnswerKey.exam_id == exam.id).order_by(AnswerKey.question_number)
        ).all()
    )
    return sum(float(k.points) for k in keys) if keys else 0.0


def _persist_notice_result(
    session_id: int,
    exam_id: int,
    logical_path: str,
    message: str,
    *,
    status: ResultStatus = ResultStatus.MANUAL_REVIEW,
) -> None:
    """Atılan səhifə, QR uyğunsuzluğu və s. üçün açıq ScanResult (səssiz itki yox)."""
    with SyncSessionLocal() as db:
        max_pts = _max_score_for_exam(db, exam_id)
        db.add(
            ScanResult(
                session_id=session_id,
                image_path=logical_path,
                detected_answers={},
                score=0.0,
                max_score=max_pts,
                status=status,
                error_message=message[:1024],
                processed_at=datetime.utcnow(),
            )
        )
        db.commit()


def _flag_duplicate_student_results(session_id: int) -> None:
    """Eyni sessiyada eyni şagird üçün təkrar nəticələri işarələ (hamısı, birinci daxil)."""
    with SyncSessionLocal() as db:
        rows = list(
            db.scalars(
                select(ScanResult)
                .where(ScanResult.session_id == session_id, ScanResult.student_id.is_not(None))
                .order_by(ScanResult.id.asc())
            ).all()
        )
        by_student: dict[int, list[ScanResult]] = {}
        for row in rows:
            sid = int(row.student_id)  # type: ignore[arg-type]
            by_student.setdefault(sid, []).append(row)
        changed = False
        dup_msg = "Eyni şagird üçün təkrar skan nəticəsi — manual yoxlama tələb olunur"
        for group in by_student.values():
            if len(group) <= 1:
                continue
            for row in group:
                if row.status == ResultStatus.OK:
                    row.status = ResultStatus.MANUAL_REVIEW
                    changed = True
                prev = row.error_message or ""
                if dup_msg not in prev:
                    row.error_message = f"{prev}; {dup_msg}" if prev else dup_msg
                    changed = True
        if changed:
            db.commit()


def _iter_zip_images(data: bytes) -> list[tuple[str, bytes]]:
    out: list[tuple[str, bytes]] = []
    with zipfile.ZipFile(BytesIO(data)) as zf:
        infos = [i for i in zf.infolist() if not i.is_dir()]
        if len(infos) > MAX_ZIP_MEMBERS:
            raise ValueError(f"ZIP çox fayl ehtiva edir (>{MAX_ZIP_MEMBERS})")
        total = sum(i.file_size for i in infos)
        if total > MAX_ZIP_UNCOMPRESSED_BYTES:
            raise ValueError("ZIP çıxarılmış ölçü həddi keçir")
        compressed = sum(i.compress_size for i in infos)
        if compressed > 0 and total / compressed > MAX_ZIP_COMPRESSION_RATIO:
            raise ValueError("ZIP sıxılma nisbəti həddindən yüksəkdir (zip-bomb qorunması)")
        for info in infos:
            lower = info.filename.lower()
            if lower.endswith(_IMAGE_EXT):
                out.append((info.filename, zf.read(info.filename)))
    return out


def _persist_result(
    session_id: int,
    exam_id: int,
    image_bytes: bytes,
    logical_path: str,
) -> None:
    with SyncSessionLocal() as db:
        exam = db.get(Exam, exam_id)
        if exam is None:
            return
        keys = list(
            db.scalars(
                select(AnswerKey).where(AnswerKey.exam_id == exam.id).order_by(AnswerKey.question_number)
            ).all()
        )
        max_pts = sum(float(k.points) for k in keys) if keys else 0.0

        image_bytes = _normalize_image_bytes_for_omr(image_bytes)
        qr_meta = _read_qr_from_omr_service(image_bytes)
        qr_exam_id = qr_meta.get("exam_id_from_qr")
        if qr_exam_id is not None:
            try:
                if int(qr_exam_id) != int(exam.id):
                    _persist_notice_result(
                        session_id,
                        exam_id,
                        logical_path,
                        "Vərəq başqa imtahana aiddir (QR exam_id uyğunsuzluğu)",
                        status=ResultStatus.MANUAL_REVIEW,
                    )
                    return
            except (TypeError, ValueError):
                _persist_notice_result(
                    session_id,
                    exam_id,
                    logical_path,
                    "QR exam_id formatı etibarsızdır",
                    status=ResultStatus.MANUAL_REVIEW,
                )
                return

        su_pre = qr_meta.get("sheet_uuid")
        qr_fallback = False
        sheet_row: AnswerSheetTemplate | None = None

        if su_pre:
            sheet_row = db.scalar(
                select(AnswerSheetTemplate).where(
                    AnswerSheetTemplate.exam_id == exam.id,
                    AnswerSheetTemplate.sheet_uuid == str(su_pre),
                    AnswerSheetTemplate.is_draft.is_(False),
                )
            )
            if sheet_row is None:
                _persist_notice_result(
                    session_id,
                    exam_id,
                    logical_path,
                    f"Naməlum vərəq (sheet_uuid={su_pre}) — şablon tapılmadı",
                )
                return
        else:
            sheet_row = _latest_confirmed_sheet_row(db, exam.id)
            if sheet_row is None:
                _persist_notice_result(
                    session_id,
                    exam_id,
                    logical_path,
                    "QR oxunmadı — təsdiqlənmiş cavab kartı yoxdur. İmtahanda kartı PDF endirib çap/skan edin.",
                )
                return
            qr_fallback = True
            su_pre = sheet_row.sheet_uuid

        omr_tmpl = _template_for_sheet_row(sheet_row, db, exam)

        student_id: int | None = None
        breakdown: dict[str, Any] = {}

        try:
            omr = _call_omr(image_bytes, omr_tmpl)
            answers = omr.get("answers") or {}
            if not isinstance(answers, dict):
                answers = {}

            # QR kodu ilə müəyyən edilmiş sheet_uuid metadata kimi əlavə et
            sheet_uuid_detected = omr.get("sheet_uuid") or su_pre
            if sheet_uuid_detected:
                answers["__sheet_uuid__"] = sheet_uuid_detected
            qr_txt = qr_meta.get("qr_raw") if isinstance(qr_meta.get("qr_raw"), str) else None
            if qr_txt and str(qr_txt).strip():
                answers["__qr_raw__"] = str(qr_txt).strip()

            sheet_key = None
            if sheet_row and sheet_row.template_config:
                sheet_key = sheet_row.template_config.get("sheet_answer_key")
            if not sheet_key and sheet_uuid_detected:
                row2 = db.scalar(
                    select(AnswerSheetTemplate).where(
                        AnswerSheetTemplate.exam_id == exam.id,
                        AnswerSheetTemplate.sheet_uuid == str(sheet_uuid_detected),
                        AnswerSheetTemplate.is_draft.is_(False),
                    )
                )
                if row2 and row2.template_config:
                    sheet_key = row2.template_config.get("sheet_answer_key")

            score, max_score, breakdown = score_exam(
                answers, keys, exam, sheet_answer_key=sheet_key if isinstance(sheet_key, dict) else None
            )
            tpl_src = sheet_row
            if not tpl_src and sheet_uuid_detected:
                tpl_src = db.scalar(
                    select(AnswerSheetTemplate).where(
                        AnswerSheetTemplate.exam_id == exam.id,
                        AnswerSheetTemplate.sheet_uuid == str(sheet_uuid_detected),
                        AnswerSheetTemplate.is_draft.is_(False),
                    )
                )
            tpl_cfg = dict(tpl_src.template_config) if tpl_src and tpl_src.template_config else None
            student_id, st_reason = resolve_student_id_from_scan(db, exam, answers, tpl_cfg)
            conf = float(omr.get("confidence") or 0.0)
            st = ResultStatus.OK
            err = None
            if omr.get("status") == "error":
                st = ResultStatus.ERROR
                omr_detail = str(omr.get("detail") or omr.get("error") or "OMR emal uğursuz")
                err = f"OMR emal xətası — {omr_detail[:900]}"
            elif conf < settings.omr_confidence_threshold or omr.get("status") == "manual_review":
                st = ResultStatus.MANUAL_REVIEW
                if str(omr.get("detail") or "") == "omrchecker_alignment_failed":
                    align_hint = "Kart şablona uyğunlaşdırıla bilmədi — tam səhifə skan və ya foto yükləyin"
                    err = f"{err}; {align_hint}" if err else align_hint
            if template_expects_student_code(tpl_cfg) and student_id is None and st != ResultStatus.ERROR:
                st = ResultStatus.MANUAL_REVIEW
                hint = (
                    "Şagird kodu kartda tam doldurulmayıb"
                    if st_reason == "student_code_incomplete"
                    else "Bu kursda həmin 6 rəqəmli kodlu şagird yoxdur"
                )
                err = f"{err}; {hint}" if err else hint
            if qr_fallback:
                err = f"{err}; {QR_FALLBACK_NOTICE}" if err else QR_FALLBACK_NOTICE
                if st == ResultStatus.OK:
                    st = ResultStatus.MANUAL_REVIEW
        except Exception as e:  # noqa: BLE001
            answers = {}
            score, max_score, breakdown = 0.0, max_pts, {}
            st = ResultStatus.ERROR
            err = str(e)[:1024]
            student_id = None
        db.add(
            ScanResult(
                session_id=session_id,
                student_id=student_id,
                image_path=logical_path,
                detected_answers=answers if isinstance(answers, dict) else {},
                score=score,
                max_score=max_score,
                score_breakdown=breakdown if isinstance(breakdown, dict) and breakdown else None,
                status=st,
                error_message=err,
                processed_at=datetime.utcnow(),
            )
        )
        db.commit()


def _persist_zip_error(session_id: int, exam_id: int, logical_path: str, message: str) -> None:
    with SyncSessionLocal() as db:
        exam = db.get(Exam, exam_id)
        keys = (
            list(
                db.scalars(
                    select(AnswerKey).where(AnswerKey.exam_id == exam_id).order_by(AnswerKey.question_number)
                ).all()
            )
            if exam
            else []
        )
        max_pts = sum(float(k.points) for k in keys) if keys else 0.0
        db.add(
            ScanResult(
                session_id=session_id,
                image_path=logical_path,
                detected_answers={},
                score=0.0,
                max_score=max_pts,
                status=ResultStatus.ERROR,
                error_message=message[:1024],
                processed_at=datetime.utcnow(),
            )
        )
        db.commit()


@celery_app.task(
    bind=True,
    name="scan.process_session",
    max_retries=2,
    autoretry_for=(httpx.HTTPError,),
    retry_backoff=True,
    retry_backoff_max=120,
)
def process_scan_session(self, session_id: int) -> dict[str, Any]:
    lock_token = acquire_scan_session_lock(session_id)
    if lock_token is None:
        with SyncSessionLocal() as db:
            sess = db.get(ScanSession, session_id)
            stale_processing = (
                sess is not None
                and sess.status == SessionStatus.PROCESSING
                and not is_scan_session_locked(session_id)
            )
        if stale_processing:
            lock_token = force_acquire_scan_session_lock(session_id)
        else:
            mark_scan_session_reprocess_pending(session_id)
            return {"error": "session already processing", "session_id": session_id, "requeue": True}

    storage = StorageService()
    bucket = settings.minio_bucket_uploads
    storage.ensure_bucket(bucket)

    try:
        passes = 0
        last_processed = 0
        while True:
            passes += 1
            if passes > 8:
                break
            with SyncSessionLocal() as db:
                sess = db.get(ScanSession, session_id)
                if sess is None:
                    return {"error": "session not found"}
                exam_id = sess.exam_id
                correction_snapshot = _snapshot_session_corrections(db, session_id)
                subq = select(ScanResult.id).where(ScanResult.session_id == session_id)
                db.execute(delete(ManualCorrection).where(ManualCorrection.scan_result_id.in_(subq)))
                db.execute(delete(ScanResult).where(ScanResult.session_id == session_id))
                sess.status = SessionStatus.PROCESSING
                sess.processed_images = 0
                sess.finished_at = None
                db.commit()

                exam = db.get(Exam, exam_id)
                if exam is None:
                    with SyncSessionLocal() as db_err:
                        s = db_err.get(ScanSession, session_id)
                        if s:
                            s.status = SessionStatus.ERROR
                            db_err.commit()
                    return {"error": "exam not found"}

            prefix = f"scans/{session_id}/"
            try:
                names = storage.list_object_names(bucket, prefix)
            except Exception as e:  # noqa: BLE001
                with SyncSessionLocal() as db2:
                    s = db2.get(ScanSession, session_id)
                    if s:
                        s.status = SessionStatus.ERROR
                        db2.commit()
                return {"error": str(e)}

            processed = 0
            collected: list[tuple[str, bytes]] = []
            for name in sorted(names, key=_natural_sort_key):
                if name.endswith("/"):
                    continue
                lower = name.lower()
                try:
                    data = storage.get_bytes(bucket, name)
                except Exception as e:  # noqa: BLE001
                    _persist_notice_result(
                        session_id,
                        exam_id,
                        name,
                        f"Fayl oxunmadı: {str(e)[:200]}",
                        status=ResultStatus.ERROR,
                    )
                    processed += 1
                    _sync_session_progress(session_id, processed)
                    continue
                if lower.endswith(".zip"):
                    try:
                        items = _iter_zip_images(data)
                    except ValueError as e:
                        _persist_zip_error(session_id, exam_id, f"{name}:zip", str(e))
                        processed += 1
                        _sync_session_progress(session_id, processed)
                        continue
                    for fname, img in items:
                        collected.append((f"{name}:{fname}", img))
                elif lower.endswith(_IMAGE_EXT):
                    collected.append((name, data))

            with SyncSessionLocal() as db:
                default_tpl_cfg = _latest_template_config_for_exam(db, exam_id)

            if len(collected) >= 2:
                with SyncSessionLocal() as db:
                    first_cfg, _ = _resolve_image_template_config(
                        db, exam_id, collected[0][1], default_tpl_cfg
                    )
                    two_page_stitched = (
                        first_cfg.get("single_page_layout") is False
                        and bool(first_cfg.get("omr_two_page_stitched"))
                    )
            else:
                two_page_stitched = False

            if two_page_stitched:
                stitch_pairs = _pair_collected_for_stitch(collected)
                job_total = max(len(stitch_pairs), processed)
                _sync_session_progress(session_id, processed, total=job_total)
                for top_name, top_b, bot_name, bot_b in stitch_pairs:
                    extend_scan_session_lock(session_id, lock_token)
                    if bot_name and bot_b:
                        merged = _stitch_images_vertical(top_b, bot_b)
                        storage_key = _save_stitched_image(storage, bucket, session_id, merged)
                        _persist_result(session_id, exam_id, merged, storage_key)
                    else:
                        _persist_result(session_id, exam_id, top_b, top_name)
                    processed += 1
                    _sync_session_progress(session_id, processed)
            else:
                job_total = max(len(collected), processed)
                _sync_session_progress(session_id, processed, total=job_total)
                with SyncSessionLocal() as db:
                    for fname, img in collected:
                        extend_scan_session_lock(session_id, lock_token)
                        cfg, tpl_err = _resolve_image_template_config(db, exam_id, img, default_tpl_cfg)
                        if tpl_err:
                            _persist_notice_result(session_id, exam_id, fname, tpl_err)
                            processed += 1
                            _sync_session_progress(session_id, processed)
                            continue
                        if not _scan_image_allowed_for_template(fname, cfg):
                            _persist_notice_result(
                                session_id,
                                exam_id,
                                fname,
                                "İki səhifəli kart: 1-ci səhifə skan edilmir (yalnız MCQ səhifəsi gözlənilir)",
                            )
                            processed += 1
                            _sync_session_progress(session_id, processed)
                            continue
                        _persist_result(session_id, exam_id, img, fname)
                        processed += 1
                        _sync_session_progress(session_id, processed)

            _reapply_session_corrections(session_id, correction_snapshot)
            _flag_duplicate_student_results(session_id)

            with SyncSessionLocal() as db:
                s = db.get(ScanSession, session_id)
                if s:
                    s.processed_images = processed
                    s.status = SessionStatus.DONE
                    s.finished_at = datetime.utcnow()
                    db.commit()

            last_processed = processed
            if not pop_scan_session_reprocess_pending(session_id):
                break
            extend_scan_session_lock(session_id, lock_token)

        return {"session_id": session_id, "processed": last_processed, "passes": passes}
    except httpx.HTTPError:
        with SyncSessionLocal() as db_fail:
            s = db_fail.get(ScanSession, session_id)
            if s and s.status == SessionStatus.PROCESSING:
                s.status = SessionStatus.ERROR
                db_fail.commit()
        raise
    except Exception as e:  # noqa: BLE001
        with SyncSessionLocal() as db_fail:
            s = db_fail.get(ScanSession, session_id)
            if s:
                s.status = SessionStatus.ERROR
                db_fail.commit()
        return {"error": str(e)[:512], "session_id": session_id}
    finally:
        release_scan_session_lock(session_id, lock_token)
