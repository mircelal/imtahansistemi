"""İmtahan hesablama profilləri — DİM qrupları, buraxılış və sərbəst profil CRUD."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ensure_exam_write, get_current_user
from app.models.entities import ExamScoringProfile, User, UserRole
from app.schemas.exam_scoring_profiles import (
    ApplyScoringProfileRequest,
    ExamScoringProfileCreate,
    ExamScoringProfileOut,
    ExamScoringProfileUpdate,
)
from app.services.exam_lifecycle import assert_exam_content_editable
from app.services.exam_scoring_profiles import (
    apply_scoring_profile_to_grading_config,
    exam_fields_from_formula_config,
    merge_profile_into_grading_policy,
)
from app.services.exam_types import normalize_exam_category
from app.services.grading_config import validate_grading_config
from app.services.omr_template_stale import mark_exam_omr_templates_stale

router = APIRouter(prefix="/api/exam-scoring-profiles", tags=["exam-scoring-profiles"])


def _require_staff(user: User) -> None:
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR):
        raise HTTPException(status_code=403, detail="Bu əməliyyat üçün icazə yoxdur")


def _require_write_staff(user: User) -> None:
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=403, detail="Profil yaratmaq/redaktə üçün menecer və ya admin lazımdır")


@router.get("/", response_model=list[ExamScoringProfileOut])
async def list_scoring_profiles(
    category: str | None = Query(None),
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_staff(user)
    stmt = select(ExamScoringProfile).order_by(ExamScoringProfile.is_builtin.desc(), ExamScoringProfile.name.asc())
    if active_only:
        stmt = stmt.where(ExamScoringProfile.is_active.is_(True))
    if category:
        cat = await normalize_exam_category(db, category)
        stmt = stmt.where(ExamScoringProfile.category == cat)
    rows = list((await db.scalars(stmt)).all())
    return [ExamScoringProfileOut.model_validate(r) for r in rows]


@router.get("/{profile_id}", response_model=ExamScoringProfileOut)
async def get_scoring_profile(
    profile_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_staff(user)
    row = await db.get(ExamScoringProfile, profile_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Profil tapılmadı")
    return ExamScoringProfileOut.model_validate(row)


@router.post("/", response_model=ExamScoringProfileOut)
async def create_scoring_profile(
    payload: ExamScoringProfileCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write_staff(user)
    entity = ExamScoringProfile(
        name=payload.name.strip(),
        category=await normalize_exam_category(db, payload.category),
        description=payload.description,
        formula_config=dict(payload.formula_config or {}),
        is_builtin=False,
        is_active=bool(payload.is_active),
        created_by_id=user.id,
    )
    db.add(entity)
    await db.commit()
    await db.refresh(entity)
    return ExamScoringProfileOut.model_validate(entity)


@router.put("/{profile_id}", response_model=ExamScoringProfileOut)
async def update_scoring_profile(
    profile_id: int,
    payload: ExamScoringProfileUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write_staff(user)
    row = await db.get(ExamScoringProfile, profile_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Profil tapılmadı")
    if row.is_builtin:
        raise HTTPException(status_code=400, detail="Sistem (DİM) profilləri redaktə olunmur — klonlayın")
    data = payload.model_dump(exclude_unset=True)
    if "category" in data and data["category"] is not None:
        data["category"] = await normalize_exam_category(db, data["category"])
    if "name" in data and data["name"] is not None:
        data["name"] = str(data["name"]).strip()
    for k, v in data.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return ExamScoringProfileOut.model_validate(row)


@router.post("/{profile_id}/clone", response_model=ExamScoringProfileOut)
async def clone_scoring_profile(
    profile_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write_staff(user)
    src = await db.get(ExamScoringProfile, profile_id)
    if src is None:
        raise HTTPException(status_code=404, detail="Profil tapılmadı")
    entity = ExamScoringProfile(
        name=f"{src.name} (klon)",
        category=src.category,
        description=src.description,
        formula_config=dict(src.formula_config or {}),
        is_builtin=False,
        is_active=True,
        created_by_id=user.id,
    )
    db.add(entity)
    await db.commit()
    await db.refresh(entity)
    return ExamScoringProfileOut.model_validate(entity)


@router.delete("/{profile_id}")
async def delete_scoring_profile(
    profile_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write_staff(user)
    row = await db.get(ExamScoringProfile, profile_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Profil tapılmadı")
    if row.is_builtin:
        raise HTTPException(status_code=400, detail="Sistem (DİM) profilləri silinmir")
    row.is_active = False
    await db.commit()
    return {"message": "Profil deaktiv edildi", "id": profile_id}


# Apply endpoint lives under /api/exams — registered from exams router for path consistency
async def apply_scoring_profile_to_exam(
    exam_id: int,
    profile_id: int,
    payload: ApplyScoringProfileRequest,
    db: AsyncSession,
    user: User,
) -> dict:
    exam = await ensure_exam_write(exam_id, user, db)
    assert_exam_content_editable(exam)
    profile = await db.get(ExamScoringProfile, profile_id)
    if profile is None or not profile.is_active:
        raise HTTPException(status_code=404, detail="Profil tapılmadı")

    fc = dict(profile.formula_config or {})
    gc = apply_scoring_profile_to_grading_config(
        fc,
        dict(exam.grading_config or {}),
        replace_blocks=bool(payload.replace_blocks),
    )
    q_count = int(exam.question_count or 0)
    if payload.update_exam_fields:
        fields = exam_fields_from_formula_config(fc)
        if "question_count" in fields:
            q_count = int(fields["question_count"])
            exam.question_count = q_count
        if "options_per_question" in fields:
            exam.options_per_question = int(fields["options_per_question"])
        if "negative_marking" in fields:
            exam.negative_marking = bool(fields["negative_marking"])
        if "negative_ratio" in fields:
            exam.negative_ratio = float(fields["negative_ratio"])

    validate_grading_config(gc, q_count)
    exam.grading_config = gc
    exam.grading_policy = merge_profile_into_grading_policy(
        dict(exam.grading_policy or {}), fc, gc
    )
    exam.exam_category = profile.category
    exam.scoring_profile_id = profile.id
    await mark_exam_omr_templates_stale(db, exam_id)
    await db.commit()
    await db.refresh(exam)
    return {
        "message": "Hesablama profili tətbiq olundu",
        "exam_id": exam.id,
        "scoring_profile_id": profile.id,
        "exam_category": exam.exam_category,
        "grading_config": exam.grading_config,
        "grading_policy": exam.grading_policy,
        "question_count": exam.question_count,
        "options_per_question": exam.options_per_question,
        "negative_marking": exam.negative_marking,
    }
