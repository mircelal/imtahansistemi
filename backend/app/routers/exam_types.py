"""İmtahan növləri CRUD — slug Exam.exam_category / ExamScoringProfile.category ilə uyğun."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.entities import ExamType, User, UserRole
from app.schemas.exam_types import ExamTypeCreate, ExamTypeOut, ExamTypeUpdate
from app.services.exam_types import (
    assert_profile_belongs_or_exists,
    count_active_usage,
    get_exam_type_by_slug,
    validate_slug_format,
)

router = APIRouter(prefix="/api/exam-types", tags=["exam-types"])


def _require_staff(user: User) -> None:
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR):
        raise HTTPException(status_code=403, detail="Bu əməliyyat üçün icazə yoxdur")


def _require_write_staff(user: User) -> None:
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=403, detail="İmtahan növü idarə etmək üçün menecer və ya admin lazımdır")


@router.get("/", response_model=list[ExamTypeOut])
async def list_exam_types(
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_staff(user)
    stmt = select(ExamType).order_by(ExamType.sort_order.asc(), ExamType.label.asc())
    if active_only:
        stmt = stmt.where(ExamType.is_active.is_(True))
    rows = list((await db.scalars(stmt)).all())
    return [ExamTypeOut.model_validate(r) for r in rows]


@router.get("/{type_id}", response_model=ExamTypeOut)
async def get_exam_type(
    type_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_staff(user)
    row = await db.get(ExamType, type_id)
    if row is None:
        raise HTTPException(status_code=404, detail="İmtahan növü tapılmadı")
    return ExamTypeOut.model_validate(row)


@router.post("/", response_model=ExamTypeOut)
async def create_exam_type(
    payload: ExamTypeCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write_staff(user)
    slug = validate_slug_format(payload.slug)
    existing = await get_exam_type_by_slug(db, slug)
    if existing is not None:
        raise HTTPException(status_code=400, detail=f"Bu slug artıq mövcuddur: {slug}")
    await assert_profile_belongs_or_exists(db, payload.default_scoring_profile_id)
    entity = ExamType(
        slug=slug,
        label=payload.label.strip(),
        description=payload.description,
        sort_order=int(payload.sort_order or 0),
        is_builtin=False,
        is_active=bool(payload.is_active),
        default_scoring_profile_id=payload.default_scoring_profile_id,
    )
    db.add(entity)
    await db.commit()
    await db.refresh(entity)
    return ExamTypeOut.model_validate(entity)


@router.put("/{type_id}", response_model=ExamTypeOut)
async def update_exam_type(
    type_id: int,
    payload: ExamTypeUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write_staff(user)
    row = await db.get(ExamType, type_id)
    if row is None:
        raise HTTPException(status_code=404, detail="İmtahan növü tapılmadı")
    data = payload.model_dump(exclude_unset=True)

    if "slug" in data and data["slug"] is not None:
        if row.is_builtin:
            raise HTTPException(status_code=400, detail="Sistem (builtin) növlərin slug-u dəyişdirilmir")
        new_slug = validate_slug_format(data["slug"])
        if new_slug != row.slug:
            clash = await get_exam_type_by_slug(db, new_slug)
            if clash is not None and clash.id != row.id:
                raise HTTPException(status_code=400, detail=f"Bu slug artıq mövcuddur: {new_slug}")
            data["slug"] = new_slug

    if "label" in data and data["label"] is not None:
        data["label"] = str(data["label"]).strip()

    if "default_scoring_profile_id" in data:
        await assert_profile_belongs_or_exists(db, data["default_scoring_profile_id"])

    if "is_active" in data and data["is_active"] is False and row.is_active:
        if row.is_builtin:
            raise HTTPException(status_code=400, detail="Sistem (builtin) növlər deaktiv edilə bilməz")
        exam_n, profile_n = await count_active_usage(db, row.slug)
        if exam_n > 0 or profile_n > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Növ istifadədədir (aktiv imtahan: {exam_n}, profil: {profile_n}) — əvvəlcə onları dəyişin",
            )

    for k, v in data.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return ExamTypeOut.model_validate(row)


@router.delete("/{type_id}")
async def deactivate_exam_type(
    type_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Soft-delete: is_active=false."""
    _require_write_staff(user)
    row = await db.get(ExamType, type_id)
    if row is None:
        raise HTTPException(status_code=404, detail="İmtahan növü tapılmadı")
    if row.is_builtin:
        raise HTTPException(status_code=400, detail="Sistem (builtin) növlər silinmir")
    exam_n, profile_n = await count_active_usage(db, row.slug)
    if exam_n > 0 or profile_n > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Növ istifadədədir (aktiv imtahan: {exam_n}, profil: {profile_n})",
        )
    row.is_active = False
    await db.commit()
    return {"message": "İmtahan növü deaktiv edildi", "id": type_id}
