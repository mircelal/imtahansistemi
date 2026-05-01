import json
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
from app.services.scan_scoring import score_exam
from app.services.student_resolve import (
    resolve_student_id_from_scan,
    template_expects_student_code,
)
from app.services.storage import StorageService

settings = get_settings()

MAX_ZIP_MEMBERS = 500
MAX_ZIP_UNCOMPRESSED_BYTES = 500 * 1024 * 1024

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


def _sheet_cfg_for_omr_recompute(cfg: dict[str, Any]) -> dict[str, Any]:
    """Saxlanmış omr_template köhnə ola bilər; layout həmişə cari get_omr_template ilə hesablanır."""
    return {k: v for k, v in dict(cfg).items() if k != "omr_template"}


def _template_for_sheet_row(row: AnswerSheetTemplate | None, db: Any, exam: Exam) -> dict[str, Any]:
    if row and row.template_config:
        cfg = dict(row.template_config)
        if any(
            k in cfg
            for k in (
                "question_count",
                "paper_size",
                "columns_count",
                "layout_mode",
                "mcq_grid",
                "options_per_question",
            )
        ):
            return get_omr_template(_sheet_cfg_for_omr_recompute(cfg))
        if "omr_template" in cfg:
            return cfg["omr_template"]
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
        if any(
            k in cfg
            for k in (
                "question_count",
                "paper_size",
                "columns_count",
                "layout_mode",
                "mcq_grid",
                "options_per_question",
            )
        ):
            return get_omr_template(_sheet_cfg_for_omr_recompute(cfg))
        if "omr_template" in cfg:
            return cfg["omr_template"]

    # Fallback: exam-dən əsas konfiqurasiya
    exam_cfg = {
        "question_count":     exam.question_count,
        "options_per_question": exam.options_per_question,
        "columns_count":      getattr(exam, "columns_count", 2),
        "paper_size":         "A4",
    }
    return get_omr_template(exam_cfg)


def _iter_zip_images(data: bytes) -> list[tuple[str, bytes]]:
    out: list[tuple[str, bytes]] = []
    with zipfile.ZipFile(BytesIO(data)) as zf:
        infos = [i for i in zf.infolist() if not i.is_dir()]
        if len(infos) > MAX_ZIP_MEMBERS:
            raise ValueError(f"ZIP çox fayl ehtiva edir (>{MAX_ZIP_MEMBERS})")
        total = sum(i.file_size for i in infos)
        if total > MAX_ZIP_UNCOMPRESSED_BYTES:
            raise ValueError("ZIP çıxarılmış ölçü həddi keçir")
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
        su_pre = qr_meta.get("sheet_uuid")
        sheet_row = None
        if su_pre:
            sheet_row = db.scalar(
                select(AnswerSheetTemplate).where(
                    AnswerSheetTemplate.exam_id == exam.id,
                    AnswerSheetTemplate.sheet_uuid == str(su_pre),
                    AnswerSheetTemplate.is_draft.is_(False),
                )
            )
        omr_tmpl = _template_for_sheet_row(sheet_row, db, exam)

        student_id: int | None = None
        breakdown: dict[str, Any] = {}

        try:
            omr = _call_omr(image_bytes, omr_tmpl)
            answers = omr.get("answers") or {}
            if not isinstance(answers, dict):
                answers = {}

            # QR kodu ilə müəyyən edilmiş sheet_uuid metadata kimi əlavə et
            sheet_uuid_detected = omr.get("sheet_uuid")
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
            if conf < settings.omr_confidence_threshold or omr.get("status") == "manual_review":
                st = ResultStatus.MANUAL_REVIEW
            err = None
            if template_expects_student_code(tpl_cfg) and student_id is None:
                st = ResultStatus.MANUAL_REVIEW
                hint = (
                    "Şagird kodu kartda tam doldurulmayıb"
                    if st_reason == "student_code_incomplete"
                    else "Bu kursda həmin 6 rəqəmli kodlu şagird yoxdur"
                )
                err = f"{err}; {hint}" if err else hint
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


@celery_app.task(name="scan.process_session")
def process_scan_session(session_id: int) -> dict[str, Any]:
    storage = StorageService()
    bucket = settings.minio_bucket_uploads
    storage.ensure_bucket(bucket)

    with SyncSessionLocal() as db:
        sess = db.get(ScanSession, session_id)
        if sess is None:
            return {"error": "session not found"}
        exam_id = sess.exam_id
        subq = select(ScanResult.id).where(ScanResult.session_id == session_id)
        db.execute(delete(ManualCorrection).where(ManualCorrection.scan_result_id.in_(subq)))
        db.execute(delete(ScanResult).where(ScanResult.session_id == session_id))
        sess.status = SessionStatus.PROCESSING
        sess.processed_images = 0
        sess.finished_at = None
        db.commit()

        exam = db.get(Exam, exam_id)
        if exam is None:
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
    for name in sorted(names):
        if name.endswith("/"):
            continue
        lower = name.lower()
        try:
            data = storage.get_bytes(bucket, name)
        except Exception:  # noqa: BLE001
            continue
        if lower.endswith(".zip"):
            try:
                items = _iter_zip_images(data)
            except ValueError as e:
                _persist_zip_error(session_id, exam_id, f"{name}:zip", str(e))
                processed += 1
                continue
            for fname, img in items:
                _persist_result(session_id, exam_id, img, f"{name}:{fname}")
                processed += 1
        elif lower.endswith(_IMAGE_EXT):
            _persist_result(session_id, exam_id, data, name)
            processed += 1

    with SyncSessionLocal() as db:
        s = db.get(ScanSession, session_id)
        if s:
            s.processed_images = processed
            s.status = SessionStatus.DONE
            s.finished_at = datetime.utcnow()
            db.commit()

    return {"session_id": session_id, "processed": processed}
