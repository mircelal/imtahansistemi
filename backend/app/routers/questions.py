import csv
import json
from io import StringIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.deps import ensure_exam_access, ensure_exam_write, get_current_user
from app.models.entities import BankQuestion, BankSubject, Question, QuestionType, User
from app.schemas.question_bank import QuestionFromBankBulkCreate, QuestionFromBankBulkResult, QuestionFromBankCreate
from app.schemas.questions import QuestionCreate, QuestionImportResult, QuestionOut, QuestionUpdate
from app.services.bank_question_options import normalize_bank_options
from app.services.question_bank_norm import normalize_difficulty, parse_difficulty_csv

from app.services.omr_template_stale import mark_exam_omr_templates_stale

router = APIRouter(prefix="/api/exams", tags=["questions"])


def _default_mcq_options_if_needed(qtype: QuestionType, options):
    if qtype != QuestionType.MCQ:
        return options
    if options is not None:
        return options
    return {
        "choices": [
            {"key": "A", "html": "<p></p>"},
            {"key": "B", "html": "<p></p>"},
            {"key": "C", "html": "<p></p>"},
            {"key": "D", "html": "<p></p>"},
        ],
        "correct_key": "A",
    }


async def _resolve_bank_subject_id(
    db: AsyncSession,
    *,
    subject_id: int | None,
    subject_short_code: str | None = None,
) -> int | None:
    if subject_id is not None:
        sub = await db.get(BankSubject, subject_id)
        if sub is None:
            raise HTTPException(status_code=400, detail="Seçilmiş fənn tapılmadı")
        if not sub.is_active:
            raise HTTPException(status_code=400, detail="Bu fənn qeyri-aktivdir")
        return subject_id
    if subject_short_code:
        code = subject_short_code.strip()
        if not code:
            return None
        sid = await db.scalar(select(BankSubject.id).where(BankSubject.short_code == code))
        if sid is None:
            raise HTTPException(status_code=400, detail=f"Fənn kodu tapılmadı: {code}")
        sub = await db.get(BankSubject, int(sid))
        if sub and not sub.is_active:
            raise HTTPException(status_code=400, detail="Bu fənn qeyri-aktivdir")
        return int(sid)
    return None


async def _insert_bank_row(
    db: AsyncSession,
    *,
    subject_id: int | None,
    difficulty,
    qtype: QuestionType,
    stem: str,
    options,
    points: float,
    metadata: dict,
) -> BankQuestion:
    raw_opts = _default_mcq_options_if_needed(qtype, options)
    opts = normalize_bank_options(qtype, raw_opts)
    b = BankQuestion(
        subject_id=subject_id,
        difficulty=normalize_difficulty(difficulty),
        qtype=qtype,
        stem=stem or "",
        options=opts,
        points=points,
        metadata_json=metadata or {},
    )
    db.add(b)
    await db.flush()
    return b


def _serialize_question(q: Question) -> QuestionOut:
    b = q.bank_question
    sid = b.subject_id if b else None
    sname = b.subject_ref.name if b and b.subject_ref else None
    sscode = b.subject_ref.short_code if b and b.subject_ref else None
    return QuestionOut(
        id=q.id,
        exam_id=q.exam_id,
        bank_question_id=q.bank_question_id,
        subject_id=sid,
        subject_name=sname,
        subject_short_code=sscode,
        difficulty=b.difficulty if b else None,
        order_index=q.order_index,
        qtype=q.qtype,
        stem=q.stem,
        options=q.options,
        points=q.points,
        metadata_json=q.metadata_json or {},
        created_at=q.created_at,
    )


async def _load_question(db: AsyncSession, qid: int) -> Question | None:
    return await db.scalar(
        select(Question)
        .options(selectinload(Question.bank_question).selectinload(BankQuestion.subject_ref))
        .where(Question.id == qid)
    )


@router.get("/{exam_id}/questions", response_model=list[QuestionOut])
async def list_questions(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_exam_access(exam_id, user, db)
    rows = (
        await db.scalars(
            select(Question)
            .options(selectinload(Question.bank_question).selectinload(BankQuestion.subject_ref))
            .where(Question.exam_id == exam_id)
            .order_by(Question.order_index.asc())
        )
    ).all()
    return [_serialize_question(r) for r in rows]


@router.post("/{exam_id}/questions", response_model=QuestionOut)
async def create_question(
    exam_id: int,
    payload: QuestionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_exam_write(exam_id, user, db)
    if payload.qtype == QuestionType.TF:
        raise HTTPException(
            status_code=400,
            detail="Doğru/Yanlış sualları hələ dəstəklənmir — çoxseçimli (MCQ) sual istifadə edin",
        )
    exists = await db.scalar(
        select(Question.id).where(Question.exam_id == exam_id, Question.order_index == payload.order_index)
    )
    if exists is not None:
        raise HTTPException(status_code=400, detail="order_index already exists for this exam")
    meta = payload.metadata if payload.metadata is not None else {}
    sid = await _resolve_bank_subject_id(db, subject_id=payload.subject_id, subject_short_code=None)
    bank = await _insert_bank_row(
        db,
        subject_id=sid,
        difficulty=payload.difficulty,
        qtype=payload.qtype,
        stem=payload.stem,
        options=payload.options,
        points=payload.points,
        metadata=meta,
    )
    row = Question(
        exam_id=exam_id,
        bank_question_id=bank.id,
        order_index=payload.order_index,
        qtype=payload.qtype,
        stem=payload.stem,
        options=bank.options,
        points=payload.points,
        metadata_json=meta,
    )
    db.add(row)
    await mark_exam_omr_templates_stale(db, exam_id)
    await db.commit()
    loaded = await _load_question(db, row.id)
    if loaded is None:
        raise HTTPException(status_code=500, detail="Sual yaradılmadı")
    return _serialize_question(loaded)


@router.post("/{exam_id}/questions/from-bank", response_model=QuestionOut)
async def create_question_from_bank(
    exam_id: int,
    payload: QuestionFromBankCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_exam_write(exam_id, user, db)
    exists = await db.scalar(
        select(Question.id).where(Question.exam_id == exam_id, Question.order_index == payload.order_index)
    )
    if exists is not None:
        raise HTTPException(status_code=400, detail="order_index already exists for this exam")
    bank = await db.scalar(
        select(BankQuestion).options(selectinload(BankQuestion.subject_ref)).where(BankQuestion.id == payload.bank_question_id)
    )
    if bank is None:
        raise HTTPException(status_code=404, detail="Bazada sual tapılmadı")
    meta = dict(bank.metadata_json or {})
    row = Question(
        exam_id=exam_id,
        bank_question_id=bank.id,
        order_index=payload.order_index,
        qtype=bank.qtype,
        stem=bank.stem,
        options=bank.options,
        points=bank.points,
        metadata_json=meta,
    )
    db.add(row)
    await db.commit()
    loaded = await _load_question(db, row.id)
    if loaded is None:
        raise HTTPException(status_code=500, detail="Sual yaradılmadı")
    return _serialize_question(loaded)


@router.post("/{exam_id}/questions/from-bank/bulk", response_model=QuestionFromBankBulkResult)
async def create_questions_from_bank_bulk(
    exam_id: int,
    payload: QuestionFromBankBulkCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_exam_write(exam_id, user, db)
    seen_ids: set[int] = set()
    unique_ids: list[int] = []
    for raw in payload.bank_question_ids:
        bid = int(raw)
        if bid in seen_ids:
            continue
        seen_ids.add(bid)
        unique_ids.append(bid)
    if not unique_ids:
        raise HTTPException(status_code=400, detail="Ən azı bir sual seçilməlidir")

    if payload.start_order_index is not None:
        next_order = int(payload.start_order_index)
    else:
        max_order = await db.scalar(
            select(func.max(Question.order_index)).where(Question.exam_id == exam_id)
        )
        next_order = int(max_order or 0) + 1

    imported = 0
    skipped = 0
    errors: list[str] = []
    for bid in unique_ids:
        clash = await db.scalar(
            select(Question.id).where(Question.exam_id == exam_id, Question.order_index == next_order)
        )
        if clash is not None:
            skipped += 1
            errors.append(f"#{bid}: sıra {next_order} artıq doludur")
            next_order += 1
            continue
        bank = await db.scalar(
            select(BankQuestion).options(selectinload(BankQuestion.subject_ref)).where(BankQuestion.id == bid)
        )
        if bank is None:
            skipped += 1
            errors.append(f"#{bid}: bazada tapılmadı")
            continue
        meta = dict(bank.metadata_json or {})
        row = Question(
            exam_id=exam_id,
            bank_question_id=bank.id,
            order_index=next_order,
            qtype=bank.qtype,
            stem=bank.stem,
            options=bank.options,
            points=bank.points,
            metadata_json=meta,
        )
        db.add(row)
        imported += 1
        next_order += 1
    await db.commit()
    return QuestionFromBankBulkResult(imported=imported, skipped=skipped, errors=errors)


@router.put("/{exam_id}/questions/{question_id}", response_model=QuestionOut)
async def update_question(
    exam_id: int,
    question_id: int,
    payload: QuestionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_exam_write(exam_id, user, db)
    row = await db.scalar(
        select(Question)
        .options(selectinload(Question.bank_question).selectinload(BankQuestion.subject_ref))
        .where(Question.id == question_id)
    )
    if row is None or row.exam_id != exam_id:
        raise HTTPException(status_code=404, detail="Question not found")
    data = payload.model_dump(exclude_unset=True)
    if "order_index" in data and data["order_index"] != row.order_index:
        clash = await db.scalar(
            select(Question.id).where(
                Question.exam_id == exam_id,
                Question.order_index == data["order_index"],
                Question.id != question_id,
            )
        )
        if clash is not None:
            raise HTTPException(status_code=400, detail="order_index already exists for this exam")
    if "metadata" in data:
        data["metadata_json"] = data.pop("metadata")

    bank_side: dict = {}
    if "subject_id" in data:
        sid_raw = data.pop("subject_id")
        bank_side["subject_id"] = (
            await _resolve_bank_subject_id(db, subject_id=sid_raw, subject_short_code=None)
            if sid_raw is not None
            else None
        )
    if "difficulty" in data:
        dval = data.pop("difficulty")
        if dval is not None:
            bank_side["difficulty"] = normalize_difficulty(dval)

    for key, value in data.items():
        setattr(row, key, value)

    b = row.bank_question
    if b is not None:
        for bk, bv in bank_side.items():
            setattr(b, bk, bv)
        if any(k in data for k in ("stem", "options", "qtype", "points")):
            b.stem = row.stem
            b.points = row.points
            b.qtype = row.qtype
            qt = row.qtype
            if "options" in data:
                raw_opts = _default_mcq_options_if_needed(qt, row.options)
                b.options = normalize_bank_options(qt, raw_opts)
            elif "qtype" in data:
                raw_opts = _default_mcq_options_if_needed(qt, row.options)
                b.options = normalize_bank_options(qt, raw_opts)
            row.options = b.options

    await db.commit()
    loaded = await _load_question(db, question_id)
    if loaded is None:
        raise HTTPException(status_code=404, detail="Question not found")
    return _serialize_question(loaded)


@router.delete("/{exam_id}/questions/{question_id}")
async def delete_question(
    exam_id: int,
    question_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_exam_write(exam_id, user, db)
    row = await db.get(Question, question_id)
    if row is None or row.exam_id != exam_id:
        raise HTTPException(status_code=404, detail="Question not found")
    await db.delete(row)
    await mark_exam_omr_templates_stale(db, exam_id)
    await db.commit()
    return {"message": "Deleted"}


@router.post("/{exam_id}/questions/import", response_model=QuestionImportResult)
async def import_questions_csv(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    file: UploadFile = File(...),
):
    await ensure_exam_write(exam_id, user, db)
    raw = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(StringIO(raw))
    required = {"order_index", "stem"}
    if not reader.fieldnames or not required.issubset({h.strip() for h in reader.fieldnames}):
        raise HTTPException(
            status_code=400,
            detail=(
                "CSV must include columns: order_index, stem "
                "(optional: qtype, points, options_json, subject_id, subject_short_code, "
                "legacy subject_code → short_code ilə eyni)"
            ),
        )
    imported = 0
    skipped = 0
    for row in reader:
        try:
            order_index = int(row["order_index"].strip())
            stem = (row.get("stem") or "").strip()
            qtype_raw = (row.get("qtype") or "mcq").strip().lower()
            qtype = QuestionType.MCQ if qtype_raw == "mcq" else QuestionType.TF
            points = float(row.get("points") or 1.0)
            options = None
            if row.get("options_json"):
                options = json.loads(row["options_json"])
            subject_id_val: int | None = None
            if row.get("subject_id") and str(row["subject_id"]).strip():
                subject_id_val = int(str(row["subject_id"]).strip())
            scode = (row.get("subject_short_code") or row.get("subject_code") or "").strip() or None
            subject_resolved = await _resolve_bank_subject_id(
                db,
                subject_id=subject_id_val,
                subject_short_code=None if subject_id_val is not None else scode,
            )
            difficulty_s = parse_difficulty_csv(row.get("difficulty"))
            exists = await db.scalar(
                select(Question.id).where(Question.exam_id == exam_id, Question.order_index == order_index)
            )
            if exists is not None:
                skipped += 1
                continue
            bank = await _insert_bank_row(
                db,
                subject_id=subject_resolved,
                difficulty=difficulty_s,
                qtype=qtype,
                stem=stem,
                options=options,
                points=points,
                metadata={},
            )
            db.add(
                Question(
                    exam_id=exam_id,
                    bank_question_id=bank.id,
                    order_index=order_index,
                    qtype=qtype,
                    stem=stem,
                    options=bank.options,
                    points=points,
                    metadata_json={},
                )
            )
            imported += 1
        except (ValueError, KeyError, json.JSONDecodeError):
            skipped += 1
            continue
    await db.commit()
    await mark_exam_omr_templates_stale(db, exam_id)
    await db.commit()
    return QuestionImportResult(imported=imported, skipped=skipped)
