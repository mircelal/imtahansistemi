from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models.entities import BankQuestion, BankSubject, Question, QuestionType, User, UserRole
from app.schemas.bank_subjects import BankSubjectCreate, BankSubjectOut, BankSubjectUpdate
from app.schemas.question_bank import (
    BankQuestionCreate,
    BankQuestionOut,
    BankQuestionUpdate,
    BankSubjectBrief,
    QuestionFromBankCreate,
)
from app.services.bank_question_options import normalize_bank_options
from app.services.question_bank_norm import normalize_difficulty

router = APIRouter(prefix="/api/question-bank", tags=["question-bank"])


def _require_bank_editor(user: User) -> None:
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=403, detail="Yalnız menecer və administrator")


def _bank_question_out(row: BankQuestion) -> BankQuestionOut:
    subj = None
    if row.subject_ref:
        subj = BankSubjectBrief(
            id=row.subject_ref.id,
            name=row.subject_ref.name,
            short_code=row.subject_ref.short_code,
        )
    return BankQuestionOut(
        id=row.id,
        subject_id=row.subject_id,
        subject=subj,
        difficulty=row.difficulty,
        qtype=row.qtype,
        stem=row.stem,
        options=row.options,
        points=row.points,
        metadata_json=dict(row.metadata_json or {}),
        created_at=row.created_at,
    )


def _stmt_bank_list_base():
    return select(BankQuestion).options(selectinload(BankQuestion.subject_ref))


# ----- Fənlər -----


@router.get("/subjects", response_model=list[BankSubjectOut])
async def list_bank_subjects(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    active_only: bool = False,
):
    _require_bank_editor(user)
    stmt = select(BankSubject).order_by(BankSubject.sort_order.asc(), BankSubject.name.asc())
    if active_only:
        stmt = stmt.where(BankSubject.is_active.is_(True))
    rows = (await db.scalars(stmt)).all()
    return [BankSubjectOut.model_validate(r) for r in rows]


@router.post("/subjects", response_model=BankSubjectOut)
async def create_bank_subject(
    payload: BankSubjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_bank_editor(user)
    sc = (payload.short_code.strip()[:32] if payload.short_code else None) or None
    if sc:
        taken = await db.scalar(select(BankSubject.id).where(BankSubject.short_code == sc))
        if taken is not None:
            raise HTTPException(status_code=400, detail="Bu qısa kod artıq mövcuddur")
    row = BankSubject(
        name=payload.name.strip(),
        short_code=sc,
        description=(payload.description or "").strip() or None,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return BankSubjectOut.model_validate(row)


@router.put("/subjects/{subject_id}", response_model=BankSubjectOut)
async def update_bank_subject(
    subject_id: int,
    payload: BankSubjectUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_bank_editor(user)
    row = await db.get(BankSubject, subject_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Fənn tapılmadı")
    data = payload.model_dump(exclude_unset=True)
    if "short_code" in data:
        data["short_code"] = (data["short_code"] or "").strip()[:32] or None
        if data["short_code"]:
            clash = await db.scalar(
                select(BankSubject.id).where(
                    BankSubject.short_code == data["short_code"],
                    BankSubject.id != subject_id,
                )
            )
            if clash is not None:
                raise HTTPException(status_code=400, detail="Bu qısa kod artıq mövcuddur")
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for key, value in data.items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return BankSubjectOut.model_validate(row)


@router.delete("/subjects/{subject_id}")
async def delete_bank_subject(
    subject_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_bank_editor(user)
    row = await db.get(BankSubject, subject_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Fənn tapılmadı")
    n = await db.scalar(select(func.count()).select_from(BankQuestion).where(BankQuestion.subject_id == subject_id))
    if int(n or 0) > 0:
        raise HTTPException(
            status_code=400,
            detail="Bu fənə bağlı suallar var — əvvəl sualları başqa fənə köçürün və ya silin",
        )
    await db.delete(row)
    await db.commit()
    return {"message": "Deleted"}


# ----- Suallar -----


@router.get("/", response_model=list[BankQuestionOut])
async def list_bank_questions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    subject_id: int | None = None,
    difficulty: str | None = None,
    qtype: QuestionType | None = None,
    search: str | None = None,
    limit: int = Query(200, ge=1, le=500),
):
    _require_bank_editor(user)
    stmt = _stmt_bank_list_base()
    if subject_id is not None:
        stmt = stmt.where(BankQuestion.subject_id == subject_id)
    if difficulty is not None and difficulty.strip():
        stmt = stmt.where(BankQuestion.difficulty == normalize_difficulty(difficulty))
    if qtype is not None:
        stmt = stmt.where(BankQuestion.qtype == qtype)
    if search is not None and search.strip():
        stmt = stmt.where(BankQuestion.stem.ilike(f"%{search.strip()}%"))
    stmt = stmt.order_by(BankQuestion.id.desc()).limit(limit)
    rows = (await db.scalars(stmt)).all()
    return [_bank_question_out(r) for r in rows]


@router.post("/", response_model=BankQuestionOut)
async def create_bank_question(
    payload: BankQuestionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_bank_editor(user)
    if payload.subject_id is not None:
        sub = await db.get(BankSubject, payload.subject_id)
        if sub is None:
            raise HTTPException(status_code=400, detail="Seçilmiş fənn tapılmadı")
        if not sub.is_active:
            raise HTTPException(status_code=400, detail="Bu fənn qeyri-aktivdir")
    opts = normalize_bank_options(payload.qtype, payload.options)
    meta = payload.metadata if payload.metadata is not None else {}
    row = BankQuestion(
        subject_id=payload.subject_id,
        difficulty=normalize_difficulty(payload.difficulty),
        qtype=payload.qtype,
        stem=payload.stem or "",
        options=opts,
        points=payload.points,
        metadata_json=meta,
    )
    db.add(row)
    await db.commit()
    loaded = await db.scalar(
        select(BankQuestion).options(selectinload(BankQuestion.subject_ref)).where(BankQuestion.id == row.id)
    )
    if loaded is None:
        raise HTTPException(status_code=500, detail="Sual yaradılmadı")
    return _bank_question_out(loaded)


@router.get("/{bank_id}", response_model=BankQuestionOut)
async def get_bank_question(
    bank_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_bank_editor(user)
    row = await db.scalar(
        select(BankQuestion).options(selectinload(BankQuestion.subject_ref)).where(BankQuestion.id == bank_id)
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Sual tapılmadı")
    return _bank_question_out(row)


@router.put("/{bank_id}", response_model=BankQuestionOut)
async def update_bank_question(
    bank_id: int,
    payload: BankQuestionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_bank_editor(user)
    row = await db.scalar(
        select(BankQuestion).options(selectinload(BankQuestion.subject_ref)).where(BankQuestion.id == bank_id)
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Sual tapılmadı")
    data = payload.model_dump(exclude_unset=True)
    if "metadata" in data:
        data["metadata_json"] = data.pop("metadata")
    if "difficulty" in data and data["difficulty"] is not None:
        data["difficulty"] = normalize_difficulty(data["difficulty"])
    new_qtype = data.get("qtype", row.qtype)
    if "options" in data:
        data["options"] = normalize_bank_options(new_qtype, data["options"])
    elif "qtype" in data and data["qtype"] != row.qtype:
        data["options"] = normalize_bank_options(data["qtype"], row.options)

    if "subject_id" in data:
        sid = data["subject_id"]
        if sid is not None:
            sub = await db.get(BankSubject, sid)
            if sub is None:
                raise HTTPException(status_code=400, detail="Seçilmiş fənn tapılmadı")
            if not sub.is_active:
                raise HTTPException(status_code=400, detail="Bu fənn qeyri-aktivdir")

    for key, value in data.items():
        setattr(row, key, value)
    await db.commit()
    loaded = await db.scalar(
        select(BankQuestion).options(selectinload(BankQuestion.subject_ref)).where(BankQuestion.id == bank_id)
    )
    if loaded is None:
        raise HTTPException(status_code=404, detail="Sual tapılmadı")
    return _bank_question_out(loaded)


@router.delete("/{bank_id}")
async def delete_bank_question(
    bank_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_bank_editor(user)
    row = await db.get(BankQuestion, bank_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Sual tapılmadı")
    n = await db.scalar(select(func.count()).select_from(Question).where(Question.bank_question_id == bank_id))
    if int(n or 0) > 0:
        raise HTTPException(
            status_code=400,
            detail="Bu sual ən azı bir imtahanda istifadə olunur — əvvəl imtahan suallarından ayırın və ya silin",
        )
    await db.delete(row)
    await db.commit()
    return {"message": "Deleted"}


