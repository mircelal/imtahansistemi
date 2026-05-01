from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
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
from app.services.grading_config import validate_grading_config
from app.services.exam_branding import load_header_logo_reader_for_exam
from app.services.question_booklet_pdf import generate_booklet_cover_pdf, generate_full_question_booklet_pdf
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
        query = query.where(Exam.course_id.in_(managed))
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
        if user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Kurs olmadan imtahan yalnız administrator yarada bilər")
    else:
        await ensure_course_write(payload.course_id, user, db)
    await validate_exam_preset_assignment(
        db, course_id=payload.course_id, preset_id=payload.answer_sheet_preset_id
    )
    data = payload.model_dump(exclude={"bundled_ticket"})
    entity = Exam(**data)
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


@router.get("/{exam_id}/documents/booklet-cover")
async def download_question_booklet_cover(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    subtitle: str = Query("", max_length=400),
    line1: str = Query("", max_length=400),
    line2: str = Query("", max_length=400),
    institution: str = Query("", max_length=400),
):
    exam = await ensure_exam_access(exam_id, user, db)
    logo_reader = await load_header_logo_reader_for_exam(db, exam)
    pdf_bytes = generate_booklet_cover_pdf(
        exam_title=exam.title,
        subtitle=subtitle,
        line1=line1,
        line2=line2,
        institution=institution,
        logo_reader=logo_reader,
    )
    fn = f"imtahan-{exam_id}-kitabc-qapaq.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fn}"'},
    )


@router.get("/{exam_id}/documents/question-booklet")
async def download_question_booklet_full(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    cover_subtitle: str = Query("", max_length=400),
    cover_line1: str = Query("", max_length=400),
    cover_line2: str = Query("", max_length=400),
    cover_institution: str = Query("", max_length=400),
):
    exam = await ensure_exam_access(exam_id, user, db)
    qc = int(exam.question_count or 0)
    if qc < 1:
        raise HTTPException(status_code=400, detail="İmtahan üçün sual sayı sıfırdır")
    rows = (
        await db.scalars(select(Question).where(Question.exam_id == exam_id).order_by(Question.order_index.asc()))
    ).all()
    by_order: dict[int, dict] = {}
    for r in rows:
        by_order[int(r.order_index)] = {
            "order_index": int(r.order_index),
            "stem": r.stem or "",
            "qtype": r.qtype.value if hasattr(r.qtype, "value") else str(r.qtype),
        }
    logo_reader = await load_header_logo_reader_for_exam(db, exam)
    pdf_bytes = generate_full_question_booklet_pdf(
        exam_title=exam.title,
        question_count=qc,
        db_questions_by_order=by_order,
        cover_subtitle=cover_subtitle,
        cover_line1=cover_line1,
        cover_line2=cover_line2,
        cover_institution=cover_institution,
        logo_reader=logo_reader,
    )
    fn = f"imtahan-{exam_id}-sual-kitabcasi.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fn}"'},
    )


@router.put("/{exam_id}", response_model=ExamOut)
async def update_exam(
    exam_id: int, payload: ExamUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    row = await ensure_exam_write(exam_id, user, db)
    data = payload.model_dump(exclude_unset=True)
    if "answer_sheet_preset_id" in data:
        await validate_exam_preset_assignment(
            db, course_id=row.course_id, preset_id=data["answer_sheet_preset_id"]
        )
    if "grading_config" in data and data["grading_config"] is not None:
        validate_grading_config(dict(data["grading_config"]), row.question_count)
    for key, value in data.items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return ExamOut.model_validate(row)


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
    await db.execute(delete(AnswerKey).where(AnswerKey.exam_id == exam_id))
    for item in payload:
        db.add(AnswerKey(exam_id=exam_id, **item.model_dump()))
    await db.commit()
    return {"message": "Saved", "count": len(payload)}


@router.get("/{exam_id}/answer-key", response_model=list[AnswerKeyItem])
async def get_answer_key(exam_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await ensure_exam_access(exam_id, user, db)
    rows = (await db.scalars(select(AnswerKey).where(AnswerKey.exam_id == exam_id))).all()
    return [AnswerKeyItem(question_number=r.question_number, correct_answer=r.correct_answer, points=r.points) for r in rows]
