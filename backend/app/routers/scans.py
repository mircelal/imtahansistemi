import csv
import io
import json
import uuid
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import or_, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.celery_worker import celery_app
from app.config import get_settings
from app.database import get_db
from app.deps import ensure_exam_access, ensure_exam_write, ensure_scan_session_access, get_current_user
from app.models.entities import (
    AnswerKey,
    AnswerSheetTemplate,
    Course,
    CourseOperator,
    Exam,
    ManualCorrection,
    ResultStatus,
    ScanResult,
    ScanSession,
    SessionStatus,
    Student,
    User,
    UserRole,
)
from app.schemas.scans import (
    AssignStudentRequest,
    ManualCorrectionRequest,
    ScanReadingOut,
    ScanResultOut,
    ScanSessionCreate,
    ScanSessionEnsure,
    ScanSessionOut,
)
from app.services.exam_readiness import assert_exam_ready_for_scan
from app.services.scan_reading_payload import build_scan_reading_dict
from app.services.scan_scoring import merge_corrected_mcqs, score_exam
from app.services.student_resolve import async_resolve_student_id_from_scan, template_expects_student_code
from app.services.storage import StorageService
from app.worker.scan_session_lock import mark_scan_session_reprocess_pending

settings = get_settings()

MAX_UPLOAD_SINGLE = 50 * 1024 * 1024
MAX_UPLOAD_ZIP = 500 * 1024 * 1024
MAX_FILES_PER_REQUEST = 100

_ALLOWED_UPLOAD_EXT = frozenset({".zip", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"})


async def _read_limited(upload: UploadFile, limit: int) -> bytes:
    out = bytearray()
    while True:
        chunk = await upload.read(1024 * 1024)
        if not chunk:
            break
        out.extend(chunk)
        if len(out) > limit:
            raise HTTPException(status_code=413, detail="Fayl ölçü həddini keçir")
    return bytes(out)


def _safe_filename(name: str | None) -> str:
    if not name:
        return "file.bin"
    base = Path(name).name
    if not base or base.startswith(".") or ".." in base:
        return "file.bin"
    return base[:200]


def _session_status_str(sess: ScanSession) -> str:
    st = sess.status
    return st.value if hasattr(st, "value") else str(st)


def _session_out(sess: ScanSession, exam: Exam | None, operator: User | None) -> ScanSessionOut:
    return ScanSessionOut(
        id=sess.id,
        exam_id=sess.exam_id,
        exam_title=exam.title if exam else None,
        operator_id=sess.operator_id,
        operator_full_name=operator.full_name if operator else None,
        status=_session_status_str(sess),
        total_images=sess.total_images or 0,
        processed_images=sess.processed_images or 0,
        created_at=sess.created_at,
        finished_at=sess.finished_at,
    )


def _guess_media_type(path_hint: str) -> str:
    lower = path_hint.lower()
    if lower.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith((".heic", ".heif")):
        return "image/heic"
    return "application/octet-stream"


def _validate_upload_content(fname: str, body: bytes) -> None:
    """Uzantıya əlavə magic-byte yoxlaması."""
    lower = fname.lower()
    if lower.endswith(".zip"):
        if not body.startswith(b"PK"):
            raise HTTPException(status_code=400, detail="ZIP fayl formatı etibarsızdır")
        return
    if lower.endswith((".jpg", ".jpeg")) and not body.startswith(b"\xff\xd8\xff"):
        raise HTTPException(status_code=400, detail="JPEG fayl formatı etibarsızdır")
    if lower.endswith(".png") and not body.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=400, detail="PNG fayl formatı etibarsızdır")
    if lower.endswith(".webp") and not (body.startswith(b"RIFF") and len(body) > 11 and body[8:12] == b"WEBP"):
        raise HTTPException(status_code=400, detail="WEBP fayl formatı etibarsızdır")


def _zip_read_member(zf: zipfile.ZipFile, inner: str) -> bytes:
    names = zf.namelist()
    if inner in names:
        return zf.read(inner)
    inner_norm = inner.replace("\\", "/").lstrip("/")
    for n in names:
        nn = n.replace("\\", "/")
        if nn == inner_norm or nn.endswith("/" + inner_norm) or nn.endswith(inner_norm):
            return zf.read(n)
    raise KeyError(inner)


def _load_scan_image(storage: StorageService, bucket: str, image_path: str) -> tuple[bytes, str]:
    idx = image_path.find(".zip:")
    if idx != -1:
        zip_key = image_path[: idx + 4]
        inner = image_path[idx + 5 :]
        zdata = storage.get_bytes(bucket, zip_key)
        with zipfile.ZipFile(BytesIO(zdata)) as zf:
            body = _zip_read_member(zf, inner)
        return body, _guess_media_type(inner)
    body = storage.get_bytes(bucket, image_path)
    return body, _guess_media_type(image_path)


router = APIRouter(prefix="/api/scans", tags=["scans"])


@router.post("/sessions", response_model=ScanSessionOut)
async def create_session(
    payload: ScanSessionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=403, detail="Yetkiniz yoxdur")
    exam = await ensure_exam_write(payload.exam_id, user, db)
    await assert_exam_ready_for_scan(db, exam)
    operator = await db.get(User, payload.operator_id)
    if operator is None:
        raise HTTPException(status_code=400, detail="Operator user not found")
    row = ScanSession(
        exam_id=payload.exam_id,
        operator_id=payload.operator_id,
        status=SessionStatus.PENDING,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _session_out(row, exam, operator)


@router.post("/sessions/ensure", response_model=ScanSessionOut)
async def ensure_session(
    payload: ScanSessionEnsure,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """İmtahan skan axını: cari istifadəçi üçün aktiv partiyanı tap və ya yenisini yarat."""
    if user.role == UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Skan icazəsi yoxdur")
    exam = await ensure_exam_access(payload.exam_id, user, db)
    operator = user

    existing = await db.scalar(
        select(ScanSession)
        .where(
            ScanSession.exam_id == payload.exam_id,
            ScanSession.operator_id == operator.id,
            ScanSession.status.in_((SessionStatus.PENDING, SessionStatus.PROCESSING)),
        )
        .order_by(ScanSession.id.desc())
        .limit(1)
    )
    if existing is not None:
        return _session_out(existing, exam, operator)

    row = ScanSession(
        exam_id=payload.exam_id,
        operator_id=operator.id,
        status=SessionStatus.PENDING,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _session_out(row, exam, operator)


@router.get("/sessions", response_model=list[ScanSessionOut])
async def list_sessions(
    exam_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = (
        select(ScanSession, Exam, User)
        .join(Exam, Exam.id == ScanSession.exam_id)
        .join(User, User.id == ScanSession.operator_id)
        .order_by(ScanSession.id.desc())
    )
    if user.role == UserRole.MANAGER:
        managed_course_ids = select(Course.id).where(Course.manager_id == user.id)
        exam_ids = select(Exam.id).where(
            or_(
                Exam.course_id.in_(managed_course_ids),
                (Exam.course_id.is_(None)) & (Exam.created_by_id == user.id),
            )
        )
        query = query.where(ScanSession.exam_id.in_(exam_ids))
    elif user.role == UserRole.OPERATOR:
        assigned_courses = select(CourseOperator.course_id).where(CourseOperator.operator_user_id == user.id)
        exam_ids_for_course = select(Exam.id).where(Exam.course_id.in_(assigned_courses))
        query = query.where(
            or_(ScanSession.operator_id == user.id, ScanSession.exam_id.in_(exam_ids_for_course))
        )
    elif user.role == UserRole.STUDENT:
        return []
    if exam_id is not None:
        query = query.where(ScanSession.exam_id == exam_id)
    result = await db.execute(query)
    return [_session_out(s, e, o) for s, e, o in result.all()]


@router.get("/sessions/{session_id}", response_model=ScanSessionOut)
async def get_session(
    session_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    row = await ensure_scan_session_access(session_id, user, db)
    exam = await db.get(Exam, row.exam_id)
    operator = await db.get(User, row.operator_id)
    return _session_out(row, exam, operator)


@router.post("/sessions/{session_id}/upload")
async def upload_images(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    files: list[UploadFile] = File(...),
    auto_process: bool = True,
):
    await ensure_scan_session_access(session_id, user, db)
    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(status_code=400, detail="Bir sorğuda çox fayl (max 100)")
    sess_row = await db.get(ScanSession, session_id)
    if sess_row is None:
        raise HTTPException(status_code=404, detail="Skan oturumu tapılmadı")
    exam = await db.get(Exam, sess_row.exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="İmtahan tapılmadı")
    await assert_exam_ready_for_scan(db, exam)
    if sess_row.status == SessionStatus.PROCESSING:
        mark_scan_session_reprocess_pending(session_id)
    storage = StorageService()
    uploaded = 0
    for f in files:
        fname = _safe_filename(f.filename)
        ext = Path(fname).suffix.lower()
        if ext not in _ALLOWED_UPLOAD_EXT:
            raise HTTPException(
                status_code=400,
                detail="Dəstəklənən formatlar: ZIP, JPG, PNG, WEBP, HEIC",
            )
        name_l = fname.lower()
        limit = MAX_UPLOAD_ZIP if name_l.endswith(".zip") else MAX_UPLOAD_SINGLE
        body = await _read_limited(f, limit)
        _validate_upload_content(fname, body)
        key = f"scans/{session_id}/files/{uuid.uuid4().hex}_{fname}"
        ctype = f.content_type or ("application/zip" if name_l.endswith(".zip") else "application/octet-stream")
        if name_l.endswith((".jpg", ".jpeg")):
            ctype = "image/jpeg"
        elif name_l.endswith(".png"):
            ctype = "image/png"
        elif name_l.endswith(".webp"):
            ctype = "image/webp"
        elif name_l.endswith((".heic", ".heif")):
            ctype = "image/heic"
        storage.upload_bytes(settings.minio_bucket_uploads, key, body, ctype)
        uploaded += 1
    sess_row.total_images = (sess_row.total_images or 0) + uploaded
    await db.commit()
    if auto_process:
        celery_app.send_task("scan.process_session", args=[session_id])
    return {"session_id": session_id, "uploaded": uploaded, "queued": auto_process}


@router.post("/sessions/{session_id}/process")
async def queue_process_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_scan_session_access(session_id, user, db)
    celery_app.send_task("scan.process_session", args=[session_id])
    return {"session_id": session_id, "queued": True}


@router.get("/sessions/{session_id}/results", response_model=list[ScanResultOut])
async def list_results(
    session_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    await ensure_scan_session_access(session_id, user, db)
    res = await db.execute(
        select(ScanResult, Student)
        .outerjoin(Student, Student.id == ScanResult.student_id)
        .where(ScanResult.session_id == session_id)
        .order_by(ScanResult.id)
    )
    out: list[ScanResultOut] = []
    for row, stu in res.all():
        item = ScanResultOut.model_validate(row)
        if stu is not None:
            item = item.model_copy(
                update={"student_number": stu.student_number, "student_full_name": stu.full_name}
            )
        out.append(item)
    return out


@router.get("/sessions/{session_id}/results/export")
async def export_results(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_scan_session_access(session_id, user, db)
    rows = (
        await db.scalars(
            select(ScanResult).where(ScanResult.session_id == session_id).order_by(ScanResult.id)
        )
    ).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "id",
            "image_path",
            "score",
            "max_score",
            "status",
            "error_message",
            "processed_at",
            "detected_answers_json",
        ]
    )
    for r in rows:
        st = r.status
        st_s = st.value if hasattr(st, "value") else str(st)
        w.writerow(
            [
                r.id,
                r.image_path,
                r.score if r.score is not None else "",
                r.max_score if r.max_score is not None else "",
                st_s,
                r.error_message or "",
                r.processed_at.isoformat() if r.processed_at else "",
                json.dumps(r.detected_answers or {}, ensure_ascii=False),
            ]
        )
    raw = "\ufeff" + buf.getvalue()
    return Response(
        content=raw.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="scan_session_{session_id}_results.csv"'},
    )


@router.get("/results/{result_id}/image")
async def get_result_image(
    result_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = await db.get(ScanResult, result_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Skan nəticəsi tapılmadı")
    await ensure_scan_session_access(row.session_id, user, db)
    storage = StorageService()
    try:
        body, media = _load_scan_image(storage, settings.minio_bucket_uploads, row.image_path)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Şəkil ZIP içində tapılmadı") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Fayl oxuna bilmədi") from exc
    return Response(content=body, media_type=media)


@router.get("/results/{result_id}", response_model=ScanResultOut)
async def get_result(result_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await db.get(ScanResult, result_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Skan nəticəsi tapılmadı")
    await ensure_scan_session_access(row.session_id, user, db)
    item = ScanResultOut.model_validate(row)
    if row.student_id:
        stu = await db.get(Student, row.student_id)
        if stu is not None:
            item = item.model_copy(
                update={"student_number": stu.student_number, "student_full_name": stu.full_name}
            )
    return item


async def _template_config_for_result(db: AsyncSession, exam_id: int, detected: dict[str, Any]) -> dict[str, Any] | None:
    su = (detected or {}).get("__sheet_uuid__")
    if not su:
        return None
    sheet_row = await db.scalar(
        select(AnswerSheetTemplate).where(
            AnswerSheetTemplate.exam_id == exam_id,
            AnswerSheetTemplate.sheet_uuid == str(su),
            AnswerSheetTemplate.is_draft.is_(False),
        )
    )
    if sheet_row and sheet_row.template_config:
        return dict(sheet_row.template_config)
    return None


@router.get("/results/{result_id}/reading", response_model=ScanReadingOut)
async def get_result_reading(result_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await db.get(ScanResult, result_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Skan nəticəsi tapılmadı")
    await ensure_scan_session_access(row.session_id, user, db)
    session = await db.get(ScanSession, row.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Skan oturumu tapılmadı")
    exam = await db.get(Exam, session.exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="İmtahan tapılmadı")
    tc = await _template_config_for_result(db, exam.id, row.detected_answers or {})
    keys = list(
        (
            await db.scalars(
                select(AnswerKey).where(AnswerKey.exam_id == exam.id).order_by(AnswerKey.question_number)
            )
        ).all()
    )
    payload = build_scan_reading_dict(
        result=row,
        session=session,
        exam=exam,
        template_config=tc,
        qr_raw_hint=None,
        answer_keys=keys,
    )
    return ScanReadingOut.model_validate(payload)


@router.get("/sessions/{session_id}/results/export-reading.json")
async def export_session_reading_json(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_scan_session_access(session_id, user, db)
    session = await db.get(ScanSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Skan oturumu tapılmadı")
    exam = await db.get(Exam, session.exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="İmtahan tapılmadı")
    rows = (
        await db.scalars(select(ScanResult).where(ScanResult.session_id == session_id).order_by(ScanResult.id))
    ).all()
    out_list: list[dict[str, Any]] = []
    for r in rows:
        tc = await _template_config_for_result(db, exam.id, r.detected_answers or {})
        keys = list(
            (
                await db.scalars(
                    select(AnswerKey).where(AnswerKey.exam_id == exam.id).order_by(AnswerKey.question_number)
                )
            ).all()
        )
        out_list.append(
            build_scan_reading_dict(
                result=r,
                session=session,
                exam=exam,
                template_config=tc,
                qr_raw_hint=None,
                answer_keys=keys,
            )
        )
    body = json.dumps(out_list, ensure_ascii=False, indent=2).encode("utf-8")
    return Response(
        content=body,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="scan_session_{session_id}_reading.json"'},
    )


@router.put("/results/{result_id}/correct", response_model=ScanResultOut)
async def save_correction(
    result_id: int,
    payload: ManualCorrectionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = await db.get(ScanResult, result_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Skan nəticəsi tapılmadı")
    await ensure_scan_session_access(row.session_id, user, db)

    session = await db.get(ScanSession, row.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Skan oturumu tapılmadı")
    exam = await db.get(Exam, session.exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="İmtahan tapılmadı")

    keys = list(
        (
            await db.scalars(
                select(AnswerKey).where(AnswerKey.exam_id == exam.id).order_by(AnswerKey.question_number)
            )
        ).all()
    )

    merged = merge_corrected_mcqs(row.detected_answers or {}, payload.corrected_answers or {})

    sheet_key = None
    su = merged.get("__sheet_uuid__")
    if su:
        sheet_row = await db.scalar(
            select(AnswerSheetTemplate).where(
                AnswerSheetTemplate.exam_id == exam.id,
                AnswerSheetTemplate.sheet_uuid == str(su),
                AnswerSheetTemplate.is_draft.is_(False),
            )
        )
        if sheet_row and sheet_row.template_config:
            sk = sheet_row.template_config.get("sheet_answer_key")
            sheet_key = sk if isinstance(sk, dict) else None

    score_v, max_v, breakdown = score_exam(merged, keys, exam, sheet_answer_key=sheet_key)
    if max_v <= 0 and row.max_score is not None:
        max_v = float(row.max_score)

    tc = await _template_config_for_result(db, exam.id, merged)
    new_sid, st_reason = await async_resolve_student_id_from_scan(db, exam, merged, tc)

    row.detected_answers = merged
    row.score = score_v
    row.max_score = max_v
    row.score_breakdown = breakdown or None
    row.student_id = new_sid
    if new_sid is None:
        row.status = ResultStatus.MANUAL_REVIEW
        if template_expects_student_code(tc):
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

    db.add(
        ManualCorrection(
            scan_result_id=result_id,
            corrected_answers=payload.corrected_answers,
            corrected_by=user.id,
        )
    )
    await db.commit()
    await db.refresh(row)
    item = ScanResultOut.model_validate(row, from_attributes=True)
    if row.student_id:
        stu = await db.get(Student, row.student_id)
        if stu is not None:
            item = item.model_copy(
                update={"student_number": stu.student_number, "student_full_name": stu.full_name}
            )
    return item


@router.put("/results/{result_id}/assign-student", response_model=ScanResultOut)
async def assign_student_to_result(
    result_id: int,
    payload: AssignStudentRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = await db.get(ScanResult, result_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Skan nəticəsi tapılmadı")
    await ensure_scan_session_access(row.session_id, user, db)

    session = await db.get(ScanSession, row.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Skan oturumu tapılmadı")
    exam = await db.get(Exam, session.exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="İmtahan tapılmadı")

    student: Student | None = None
    if payload.student_id is not None:
        student = await db.get(Student, payload.student_id)
    elif payload.student_number:
        num = str(payload.student_number).strip()
        if exam.course_id is None:
            raise HTTPException(status_code=400, detail="Kurssuz imtahanda şagird kodu təyin olunmur")
        student = await db.scalar(
            select(Student).where(Student.course_id == exam.course_id, Student.student_number == num)
        )
    else:
        raise HTTPException(status_code=400, detail="student_id və ya student_number tələb olunur")

    if student is None:
        raise HTTPException(status_code=404, detail="Şagird tapılmadı")
    if exam.course_id is not None and student.course_id != exam.course_id:
        raise HTTPException(status_code=400, detail="Şagird bu imtahanın kursuna aid deyil")

    merged = dict(row.detected_answers or {})
    for i, ch in enumerate(str(student.student_number).zfill(6)[-6:], start=1):
        merged[f"id_student_code{i}"] = ch

    keys = list(
        (
            await db.scalars(
                select(AnswerKey).where(AnswerKey.exam_id == exam.id).order_by(AnswerKey.question_number)
            )
        ).all()
    )
    sheet_key = None
    su = merged.get("__sheet_uuid__")
    if su:
        sheet_row = await db.scalar(
            select(AnswerSheetTemplate).where(
                AnswerSheetTemplate.exam_id == exam.id,
                AnswerSheetTemplate.sheet_uuid == str(su),
                AnswerSheetTemplate.is_draft.is_(False),
            )
        )
        if sheet_row and sheet_row.template_config:
            sk = sheet_row.template_config.get("sheet_answer_key")
            sheet_key = sk if isinstance(sk, dict) else None

    score_v, max_v, breakdown = score_exam(merged, keys, exam, sheet_answer_key=sheet_key)
    if max_v <= 0 and row.max_score is not None:
        max_v = float(row.max_score)

    dup_msg = "Eyni şagird üçün təkrar skan nəticəsi — manual yoxlama tələb olunur"
    dup_count = int(
        await db.scalar(
            select(func.count())
            .select_from(ScanResult)
            .where(
                ScanResult.session_id == row.session_id,
                ScanResult.student_id == student.id,
                ScanResult.id != row.id,
            )
        )
        or 0
    )

    row.detected_answers = merged
    row.student_id = student.id
    row.score = score_v
    row.max_score = max_v
    row.score_breakdown = breakdown or None
    row.status = ResultStatus.OK
    row.error_message = None
    if dup_count > 0:
        row.status = ResultStatus.MANUAL_REVIEW
        row.error_message = dup_msg
    await db.commit()
    await db.refresh(row)

    item = ScanResultOut.model_validate(row)
    return item.model_copy(
        update={"student_number": student.student_number, "student_full_name": student.full_name}
    )
