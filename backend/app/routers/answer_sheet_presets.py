from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ensure_course_access, get_current_user
from app.models.entities import AnswerSheetLayoutPreset, Course, CourseOperator, User, UserRole
from app.schemas.sheet_presets import AnswerSheetPresetCreate, AnswerSheetPresetOut, AnswerSheetPresetUpdate
from app.services.answer_sheet_preset_merge import (
    count_exams_using_preset,
    ensure_preset_library_write,
)

router = APIRouter(prefix="/api/answer-sheet-presets", tags=["answer-sheet-presets"])


def _require_staff(user: User) -> None:
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR):
        raise HTTPException(status_code=403, detail="Bu əməliyyat üçün menecer və ya administrator lazımdır")


async def _ensure_preset_readable(row: AnswerSheetLayoutPreset, user: User, db: AsyncSession) -> None:
    _require_staff(user)
    if row.course_id is None:
        return
    await ensure_course_access(row.course_id, user, db)


async def _allowed_course_ids(user: User, db: AsyncSession) -> list[int] | None:
    """Admin üçün None (filtirsiz); əks halda icazə verilən kurs ID-ləri."""
    if user.role == UserRole.ADMIN:
        return None
    if user.role == UserRole.MANAGER:
        rows = (await db.scalars(select(Course.id).where(Course.manager_id == user.id))).all()
        return list(rows)
    if user.role == UserRole.OPERATOR:
        rows = (
            await db.scalars(
                select(CourseOperator.course_id).where(CourseOperator.operator_user_id == user.id)
            )
        ).all()
        return list(rows)
    return []


def _strip_volatile_from_preset_config(cfg: dict) -> dict:
    out = dict(cfg or {})
    for k in ("omr_template", "header_logo_bytes", "sheet_answer_key"):
        out.pop(k, None)
    return out


@router.get("/", response_model=list[AnswerSheetPresetOut])
async def list_answer_sheet_presets(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    course_id: int | None = Query(
        None,
        description="Filtr: bu kurs + ümumi şablonlar; boş olanda rolünüzə görə bütün uyğun şablonlar",
    ),
    scope: str | None = Query(
        None,
        description="'global_only' — yalnız kurssuz ümumi şablonlar (ümumi imtahan seçimi üçün)",
    ),
):
    _require_staff(user)

    allowed = await _allowed_course_ids(user, db)
    if allowed is not None and len(allowed) == 0:
        return []

    scope_global = AnswerSheetLayoutPreset.course_id.is_(None)
    stmt = select(AnswerSheetLayoutPreset).where(AnswerSheetLayoutPreset.is_active.is_(True))

    if scope == "global_only":
        if user.role != UserRole.ADMIN:
            return []
        stmt = stmt.where(scope_global)
    elif course_id is not None:
        await ensure_course_access(course_id, user, db)
        stmt = stmt.where(or_(AnswerSheetLayoutPreset.course_id == course_id, scope_global))
    elif allowed is None:
        pass
    else:
        stmt = stmt.where(or_(AnswerSheetLayoutPreset.course_id.in_(allowed), scope_global))

    stmt = stmt.order_by(AnswerSheetLayoutPreset.course_id.is_(None).asc(), AnswerSheetLayoutPreset.name.asc())
    rows = (await db.scalars(stmt)).all()
    out: list[AnswerSheetPresetOut] = []
    for r in rows:
        n_exams = await count_exams_using_preset(db, r.id)
        out.append(
            AnswerSheetPresetOut(
                id=r.id,
                course_id=r.course_id,
                name=r.name,
                description=r.description,
                template_config=dict(r.template_config or {}),
                is_active=r.is_active,
                created_at=r.created_at,
                exams_linked_count=n_exams,
            )
        )
    return out


@router.post("/", response_model=AnswerSheetPresetOut)
async def create_answer_sheet_preset(
    payload: AnswerSheetPresetCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_staff(user)
    if payload.course_id is None:
        if user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Ümumi şablon yalnız administrator yarada bilər")
    else:
        from app.deps import ensure_course_write

        await ensure_course_write(payload.course_id, user, db)

    clean_cfg = _strip_volatile_from_preset_config(dict(payload.template_config))
    row = AnswerSheetLayoutPreset(
        course_id=payload.course_id,
        name=payload.name.strip(),
        description=(payload.description or "").strip() or None,
        template_config=clean_cfg,
        is_active=payload.is_active,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return AnswerSheetPresetOut(
        id=row.id,
        course_id=row.course_id,
        name=row.name,
        description=row.description,
        template_config=dict(row.template_config or {}),
        is_active=row.is_active,
        created_at=row.created_at,
        exams_linked_count=0,
    )


@router.get("/{preset_id}", response_model=AnswerSheetPresetOut)
async def get_answer_sheet_preset(
    preset_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_staff(user)
    row = await db.get(AnswerSheetLayoutPreset, preset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Şablon tapılmadı")
    await _ensure_preset_readable(row, user, db)
    n_exams = await count_exams_using_preset(db, row.id)
    return AnswerSheetPresetOut(
        id=row.id,
        course_id=row.course_id,
        name=row.name,
        description=row.description,
        template_config=dict(row.template_config or {}),
        is_active=row.is_active,
        created_at=row.created_at,
        exams_linked_count=n_exams,
    )


@router.put("/{preset_id}", response_model=AnswerSheetPresetOut)
async def update_answer_sheet_preset(
    preset_id: int,
    payload: AnswerSheetPresetUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_staff(user)
    row = await db.get(AnswerSheetLayoutPreset, preset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Şablon tapılmadı")
    await ensure_preset_library_write(row, user, db)
    data = payload.model_dump(exclude_unset=True)
    if "template_config" in data:
        data["template_config"] = _strip_volatile_from_preset_config(dict(data["template_config"]))
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    if "description" in data:
        data["description"] = (data["description"] or "").strip() or None
    for k, v in data.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    n_exams = await count_exams_using_preset(db, row.id)
    return AnswerSheetPresetOut(
        id=row.id,
        course_id=row.course_id,
        name=row.name,
        description=row.description,
        template_config=dict(row.template_config or {}),
        is_active=row.is_active,
        created_at=row.created_at,
        exams_linked_count=n_exams,
    )


@router.delete("/{preset_id}")
async def delete_answer_sheet_preset(
    preset_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_staff(user)
    row = await db.get(AnswerSheetLayoutPreset, preset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Şablon tapılmadı")
    await ensure_preset_library_write(row, user, db)
    await db.delete(row)
    await db.commit()
    return {"message": "Deleted"}


@router.post("/{preset_id}/duplicate", response_model=AnswerSheetPresetOut)
async def duplicate_answer_sheet_preset(
    preset_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    name_suffix: str = Query("surəti", max_length=120),
):
    _require_staff(user)
    src = await db.get(AnswerSheetLayoutPreset, preset_id)
    if src is None:
        raise HTTPException(status_code=404, detail="Şablon tapılmadı")
    await ensure_preset_library_write(src, user, db)
    if src.course_id is None and user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Ümumi şablonun surətini yalnız administrator yarada bilər")

    dup = AnswerSheetLayoutPreset(
        course_id=src.course_id,
        name=f"{src.name.strip()} ({name_suffix.strip()})"[:255],
        description=src.description,
        template_config=dict(src.template_config or {}),
        is_active=True,
    )
    db.add(dup)
    await db.commit()
    await db.refresh(dup)
    return AnswerSheetPresetOut(
        id=dup.id,
        course_id=dup.course_id,
        name=dup.name,
        description=dup.description,
        template_config=dict(dup.template_config or {}),
        is_active=dup.is_active,
        created_at=dup.created_at,
        exams_linked_count=0,
    )
