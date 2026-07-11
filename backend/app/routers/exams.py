from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ensure_course_access, ensure_course_write, ensure_exam_access, ensure_exam_write, get_current_user
from app.models.entities import (
    AnswerKey,
    AnswerSheetLayoutPreset,
    AnswerSheetTemplate,
    Course,
    CourseOperator,
    Exam,
    ExamTicket,
    Question,
    ScanSession,
    SessionStatus,
    User,
    UserRole,
)
from app.schemas.exams import AnswerKeyItem, ExamCreate, ExamIntegrationsOut, ExamListRowOut, ExamOut, ExamUpdate
from app.schemas.sheet_presets import AnswerSheetPresetBrief
from app.services.answer_sheet_preset_merge import validate_exam_preset_assignment
from app.services.exam_readiness import compute_exam_readiness
from app.services.grading_config import validate_grading_config
from app.services.omr_template_stale import mark_exam_omr_templates_stale
from app.services.exam_branding import load_header_logo_reader_for_exam
from app.services.question_booklet_pdf import generate_booklet_cover_pdf, generate_full_question_booklet_pdf
from app.services.question_booklet_docx import generate_question_booklet_docx
from app.services.booklet_layout_audit import audit_booklet_config
from app.services.booklet_layout_spec import resolve_booklet_config
from app.schemas.tickets import ExamTicketOut

router = APIRouter(prefix="/api/exams", tags=["exams"])


@router.get("/", response_model=list[ExamListRowOut])
async def list_exams(
    course_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Exam)
    if user.role == UserRole.MANAGER:
        managed = select(Course.id).where(Course.manager_id == user.id)
        query = query.where(
            or_(
                Exam.course_id.in_(managed),
                (Exam.course_id.is_(None)) & (Exam.created_by_id == user.id),
            )
        )
    elif user.role == UserRole.OPERATOR:
        assigned = select(CourseOperator.course_id).where(CourseOperator.operator_user_id == user.id)
        query = query.where(Exam.course_id.in_(assigned))
    elif user.role == UserRole.STUDENT:
        return []
    if course_id is not None:
        await ensure_course_access(course_id, user, db)
        query = query.where(Exam.course_id == course_id)
    rows = (await db.scalars(query.order_by(Exam.id.desc()))).all()
    if not rows:
        return []

    ids = [r.id for r in rows]
    q_rows = (
        await db.execute(
            select(Question.exam_id, func.count(Question.id))
            .where(Question.exam_id.in_(ids))
            .group_by(Question.exam_id)
        )
    ).all()
    qmap = {int(a): int(b) for a, b in q_rows}

    ak_rows = (
        await db.execute(
            select(AnswerKey.exam_id, func.count(AnswerKey.id))
            .where(AnswerKey.exam_id.in_(ids))
            .group_by(AnswerKey.exam_id)
        )
    ).all()
    akmap = {int(a): int(b) for a, b in ak_rows}

    tpl_rows = (
        await db.execute(
            select(AnswerSheetTemplate.exam_id, func.count(AnswerSheetTemplate.id))
            .where(
                AnswerSheetTemplate.exam_id.in_(ids),
                AnswerSheetTemplate.is_draft.is_(False),
                AnswerSheetTemplate.pdf_path.is_not(None),
            )
            .group_by(AnswerSheetTemplate.exam_id)
        )
    ).all()
    tplmap = {int(a): int(b) for a, b in tpl_rows}

    out: list[ExamListRowOut] = []
    for row in rows:
        eid = row.id
        base = ExamOut.model_validate(row)
        out.append(
            ExamListRowOut(
                **base.model_dump(),
                questions_registered=qmap.get(eid, 0),
                answer_key_rows=akmap.get(eid, 0),
                confirmed_sheet_templates=tplmap.get(eid, 0),
            )
        )
    return out


@router.post("/", response_model=ExamOut)
async def create_exam(
    payload: ExamCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    if payload.bundled_ticket is not None and payload.course_id is None:
        raise HTTPException(status_code=400, detail="Kurs seçilmədən bilet əlavə etmək olmaz")
    if payload.course_id is None:
        if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
            raise HTTPException(status_code=403, detail="Kurs olmadan imtahan yalnız administrator və ya menecer yarada bilər")
        if payload.resale_enabled and user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Yalnız administrator bilet satışını aça bilər")
    else:
        await ensure_course_write(payload.course_id, user, db)
    await validate_exam_preset_assignment(
        db, course_id=payload.course_id, preset_id=payload.answer_sheet_preset_id
    )
    validate_grading_config(dict(payload.grading_config or {}), payload.question_count)
    data = payload.model_dump(exclude={"bundled_ticket"})
    entity = Exam(**data, created_by_id=user.id)
    db.add(entity)
    await db.flush()
    if payload.bundled_ticket and entity.course_id is not None:
        db.add(
            ExamTicket(
                course_id=entity.course_id,
                exam_id=entity.id,
                **payload.bundled_ticket.model_dump(),
            )
        )
    await db.commit()
    await db.refresh(entity)
    return ExamOut.model_validate(entity)


@router.get("/{exam_id}/integrations", response_model=ExamIntegrationsOut)
async def get_exam_integrations(
    exam_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    exam = await ensure_exam_access(exam_id, user, db)
    ticket_rows = (
        await db.scalars(
            select(ExamTicket).where(ExamTicket.exam_id == exam_id).order_by(ExamTicket.id.desc())
        )
    ).all()
    n_templates = int(
        await db.scalar(
            select(func.count())
            .select_from(AnswerSheetTemplate)
            .where(
                AnswerSheetTemplate.exam_id == exam_id,
                AnswerSheetTemplate.is_draft.is_(False),
            )
        )
        or 0
    )
    n_sessions = int(
        await db.scalar(select(func.count()).select_from(ScanSession).where(ScanSession.exam_id == exam_id)) or 0
    )
    n_active = int(
        await db.scalar(
            select(func.count())
            .select_from(ScanSession)
            .where(
                ScanSession.exam_id == exam_id,
                ScanSession.status.in_((SessionStatus.PENDING, SessionStatus.PROCESSING)),
            )
        )
        or 0
    )
    return ExamIntegrationsOut(
        exam_id=exam.id,
        course_id=exam.course_id,
        exam_title=exam.title,
        linked_tickets=[ExamTicketOut.model_validate(t) for t in ticket_rows],
        answer_sheet_templates_count=n_templates,
        scan_sessions_total=n_sessions,
        scan_sessions_active=n_active,
    )


@router.get("/{exam_id}", response_model=ExamOut)
async def get_exam(exam_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await ensure_exam_access(exam_id, user, db)
    out = ExamOut.model_validate(row)
    brief = None
    if row.answer_sheet_preset_id:
        pr = await db.get(AnswerSheetLayoutPreset, row.answer_sheet_preset_id)
        if pr:
            brief = AnswerSheetPresetBrief(id=pr.id, name=pr.name)
    return out.model_copy(update={"answer_sheet_preset": brief})


@router.get("/{exam_id}/readiness")
async def get_exam_readiness(
    exam_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    exam = await ensure_exam_access(exam_id, user, db)
    return await compute_exam_readiness(db, exam)


@router.get("/{exam_id}/booklet-audit")
async def get_exam_booklet_audit(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    variant: str = Query("A", max_length=8),
):
    exam = await ensure_exam_access(exam_id, user, db)
    return audit_booklet_config(dict(exam.grading_config or {}), variant=variant)


@router.get("/{exam_id}/documents/booklet-cover")
async def download_question_booklet_cover(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    subtitle: str = Query("", max_length=400),
    line1: str = Query("", max_length=400),
    line2: str = Query("", max_length=400),
    institution: str = Query("", max_length=400),
    exam_code: str = Query("", max_length=64),
    variant: str = Query("A", max_length=8),
    duration_minutes: int | None = Query(None, ge=1, le=600),
):
    exam = await ensure_exam_access(exam_id, user, db)
    bc = resolve_booklet_config(dict(exam.grading_config or {}))
    logo_reader = await load_header_logo_reader_for_exam(db, exam)
    pdf_bytes = generate_booklet_cover_pdf(
        exam_title=exam.title,
        subtitle=subtitle,
        line1=line1,
        line2=line2,
        institution=institution,
        exam_code=exam_code or f"IMT-{exam_id}",
        exam_id=exam_id,
        variant=variant.upper(),
        organiser=str(bc.get("organiser") or ""),
        sector=str(bc.get("sector") or ""),
        exam_series=str(bc.get("exam_series") or ""),
        scheduled_label=exam.scheduled_at.strftime("%d.%m.%Y %H:%M") if exam.scheduled_at else "",
        venue=exam.venue or "",
        city=exam.city or "",
        question_count=int(exam.question_count or 0),
        duration_minutes=duration_minutes,
        logo_reader=logo_reader,
    )
    fn = f"imtahan-{exam_id}-v{variant.upper()}-kitabc-qapaq.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fn}"'},
    )


def _questions_by_order(rows: list[Question]) -> dict[int, dict]:
    by_order: dict[int, dict] = {}
    for r in rows:
        by_order[int(r.order_index)] = {
            "order_index": int(r.order_index),
            "stem": r.stem or "",
            "qtype": r.qtype.value if hasattr(r.qtype, "value") else str(r.qtype),
            "options": dict(r.options) if isinstance(r.options, dict) else None,
        }
    return by_order


def _booklet_doc_params(exam: Exam, **kwargs: str | int | None) -> dict:
    gc = dict(exam.grading_config or {})
    bc = resolve_booklet_config(gc)
    policy = dict(exam.grading_policy or {})
    dur = kwargs.pop("duration_minutes", None)
    if dur is None and isinstance(policy.get("duration_minutes"), (int, float)):
        dur = int(policy["duration_minutes"])
    variant = str(kwargs.get("variant") or "A").upper()[:8]
    return {
        "exam_title": exam.title,
        "question_count": int(exam.question_count or 0),
        "options_per_question": int(exam.options_per_question or 4),
        "grading_config": gc,
        "cover_subtitle": str(kwargs.get("cover_subtitle") or exam.description or ""),
        "cover_line1": str(kwargs.get("cover_line1") or ""),
        "cover_line2": str(kwargs.get("cover_line2") or ""),
        "cover_institution": str(kwargs.get("cover_institution") or ""),
        "exam_code": str(kwargs.get("exam_code") or f"IMT-{exam.id}"),
        "exam_id": int(exam.id),
        "variant": variant,
        "scheduled_at": exam.scheduled_at,
        "venue": exam.venue or "",
        "city": exam.city or "",
        "duration_minutes": dur,
        "organiser": str(bc.get("organiser") or "Dövlət İmtahan Mərkəzi"),
        "sector": str(bc.get("sector") or ""),
        "exam_series": str(bc.get("exam_series") or ""),
    }


@router.get("/{exam_id}/documents/question-booklet")
async def download_question_booklet_full(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    cover_subtitle: str = Query("", max_length=400),
    cover_line1: str = Query("", max_length=400),
    cover_line2: str = Query("", max_length=400),
    cover_institution: str = Query("", max_length=400),
    exam_code: str = Query("", max_length=64),
    variant: str = Query("A", max_length=8),
    duration_minutes: int | None = Query(None, ge=1, le=600),
):
    exam = await ensure_exam_access(exam_id, user, db)
    qc = int(exam.question_count or 0)
    if qc < 1:
        raise HTTPException(status_code=400, detail="İmtahan üçün sual sayı sıfırdır")
    rows = (
        await db.scalars(select(Question).where(Question.exam_id == exam_id).order_by(Question.order_index.asc()))
    ).all()
    by_order = _questions_by_order(list(rows))
    logo_reader = await load_header_logo_reader_for_exam(db, exam)
    params = _booklet_doc_params(
        exam,
        cover_subtitle=cover_subtitle,
        cover_line1=cover_line1,
        cover_line2=cover_line2,
        cover_institution=cover_institution,
        exam_code=exam_code,
        variant=variant,
        duration_minutes=duration_minutes,
    )
    pdf_bytes = generate_full_question_booklet_pdf(
        **params,
        db_questions_by_order=by_order,
        logo_reader=logo_reader,
    )
    fn = f"imtahan-{exam_id}-v{variant.upper()}-sual-kitabcasi.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fn}"'},
    )


@router.get("/{exam_id}/documents/question-booklet.docx")
async def download_question_booklet_docx(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    cover_subtitle: str = Query("", max_length=400),
    cover_line1: str = Query("", max_length=400),
    cover_line2: str = Query("", max_length=400),
    cover_institution: str = Query("", max_length=400),
    exam_code: str = Query("", max_length=64),
    variant: str = Query("A", max_length=8),
    duration_minutes: int | None = Query(None, ge=1, le=600),
):
    exam = await ensure_exam_access(exam_id, user, db)
    qc = int(exam.question_count or 0)
    if qc < 1:
        raise HTTPException(status_code=400, detail="İmtahan üçün sual sayı sıfırdır")
    rows = (
        await db.scalars(select(Question).where(Question.exam_id == exam_id).order_by(Question.order_index.asc()))
    ).all()
    by_order = _questions_by_order(list(rows))
    params = _booklet_doc_params(
        exam,
        cover_subtitle=cover_subtitle,
        cover_line1=cover_line1,
        cover_line2=cover_line2,
        cover_institution=cover_institution,
        exam_code=exam_code,
        variant=variant,
        duration_minutes=duration_minutes,
    )
    docx_bytes = generate_question_booklet_docx(**params, db_questions_by_order=by_order)
    fn = f"imtahan-{exam_id}-v{variant.upper()}-sual-kitabcasi.docx"
    return StreamingResponse(
        BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{fn}"'},
    )


@router.put("/{exam_id}", response_model=ExamOut)
async def update_exam(
    exam_id: int, payload: ExamUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    row = await ensure_exam_write(exam_id, user, db)
    data = payload.model_dump(exclude_unset=True)
    if "resale_enabled" in data and row.course_id is not None:
        raise HTTPException(status_code=400, detail="Kurs imtahanında bilet satışı flag-i yalnız platform imtahanları üçündür")
    if "resale_enabled" in data and user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Yalnız administrator bilet satışını idarə edə bilər")
    if "answer_sheet_preset_id" in data:
        await validate_exam_preset_assignment(
            db, course_id=row.course_id, preset_id=data["answer_sheet_preset_id"]
        )
    new_qc = int(data["question_count"]) if "question_count" in data else int(row.question_count or 0)
    if "grading_config" in data and data["grading_config"] is not None:
        validate_grading_config(dict(data["grading_config"]), new_qc)
    old_qc = int(row.question_count or 0)
    answer_key_cleared = False
    if "question_count" in data and int(data["question_count"]) != old_qc:
        ak_count = int(
            await db.scalar(select(func.count()).select_from(AnswerKey).where(AnswerKey.exam_id == exam_id)) or 0
        )
        if ak_count > 0 and ak_count != new_qc:
            await db.execute(delete(AnswerKey).where(AnswerKey.exam_id == exam_id))
            answer_key_cleared = True
    stale_fields = {"question_count", "options_per_question", "columns_count", "grading_config"}
    should_mark_stale = bool(stale_fields.intersection(data.keys()))
    for key, value in data.items():
        setattr(row, key, value)
    if should_mark_stale:
        await mark_exam_omr_templates_stale(db, exam_id)
    await db.commit()
    await db.refresh(row)
    out = ExamOut.model_validate(row)
    if answer_key_cleared:
        note = " [Cavab açarı sual sayı dəyişdiyi üçün silindi]"
        return out.model_copy(update={"description": (out.description or "") + note})
    return out


@router.delete("/{exam_id}")
async def delete_exam(exam_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await ensure_exam_write(exam_id, user, db)
    await db.delete(row)
    await db.commit()
    return {"message": "Deleted"}


@router.post("/{exam_id}/answer-key", response_model=dict)
async def save_answer_key(
    exam_id: int,
    payload: list[AnswerKeyItem],
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_exam_write(exam_id, user, db)
    exam_row = await db.get(Exam, exam_id)
    if exam_row is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    expected = int(exam_row.question_count or 0)
    if expected < 1:
        raise HTTPException(status_code=400, detail="İmtahan üçün sual sayı təyin edilməyib")
    if len(payload) != expected:
        raise HTTPException(
            status_code=400,
            detail=f"Cavab açarı uzunluğu ({len(payload)}) imtahanın sual sayına ({expected}) bərabər olmalıdır",
        )
    opts = int(exam_row.options_per_question or 4)
    valid_letters = {chr(ord("A") + i) for i in range(max(2, min(opts, 5)))}
    seen_q: set[int] = set()
    for item in payload:
        qn = int(item.question_number)
        if qn < 1 or qn > expected:
            raise HTTPException(
                status_code=400,
                detail=f"Sual nömrəsi 1–{expected} aralığında olmalıdır (alınan: {qn})",
            )
        if qn in seen_q:
            raise HTTPException(status_code=400, detail=f"Təkrarlanan sual nömrəsi: {qn}")
        seen_q.add(qn)
        ca = str(item.correct_answer or "").strip().upper()
        if ca not in valid_letters:
            raise HTTPException(
                status_code=400,
                detail=f"Sual {qn}: düzgün cavab «{ca}» etibarlı variant deyil ({', '.join(sorted(valid_letters))})",
            )
        if float(item.points) < 0:
            raise HTTPException(status_code=400, detail=f"Sual {qn}: bal mənfi ola bilməz")
    await db.execute(delete(AnswerKey).where(AnswerKey.exam_id == exam_id))
    for item in payload:
        db.add(
            AnswerKey(
                exam_id=exam_id,
                question_number=int(item.question_number),
                correct_answer=str(item.correct_answer).strip().upper(),
                points=float(item.points),
            )
        )
    await db.commit()
    return {"message": "Saved", "count": len(payload)}


@router.get("/{exam_id}/answer-key", response_model=list[AnswerKeyItem])
async def get_answer_key(exam_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await ensure_exam_access(exam_id, user, db)
    rows = (
        await db.scalars(
            select(AnswerKey)
            .where(AnswerKey.exam_id == exam_id)
            .order_by(AnswerKey.question_number)
        )
    ).all()
    return [AnswerKeyItem(question_number=r.question_number, correct_answer=r.correct_answer, points=r.points) for r in rows]
