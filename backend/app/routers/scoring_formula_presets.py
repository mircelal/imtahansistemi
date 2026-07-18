"""Formula şablonları CRUD — adlı mühərrik + default əmsallar."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.entities import ScoringFormulaPreset, User, UserRole
from app.schemas.scoring_formula_presets import (
    ScoringFormulaPresetCreate,
    ScoringFormulaPresetOut,
    ScoringFormulaPresetUpdate,
)
from app.services.scoring_formula_presets import normalize_engine, validate_default_params

router = APIRouter(prefix="/api/scoring-formula-presets", tags=["scoring-formula-presets"])

_SLUG_RE = re.compile(r"^[a-z0-9_]{1,48}$")


def _require_staff(user: User) -> None:
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR):
        raise HTTPException(status_code=403, detail="Bu əməliyyat üçün icazə yoxdur")


def _require_write_staff(user: User) -> None:
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=403, detail="Formula şablonu idarə etmək üçün menecer və ya admin lazımdır")


def _validate_slug(raw: str) -> str:
    slug = str(raw).strip().lower()
    if not _SLUG_RE.match(slug):
        raise HTTPException(
            status_code=400,
            detail="Slug yalnız kiçik hərf, rəqəm və _ ola bilər (maks. 48 simvol)",
        )
    return slug


async def _get_by_slug(db: AsyncSession, slug: str) -> ScoringFormulaPreset | None:
    return await db.scalar(select(ScoringFormulaPreset).where(ScoringFormulaPreset.slug == slug))


@router.get("/", response_model=list[ScoringFormulaPresetOut])
async def list_formula_presets(
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_staff(user)
    stmt = select(ScoringFormulaPreset).order_by(
        ScoringFormulaPreset.sort_order.asc(), ScoringFormulaPreset.label.asc()
    )
    if active_only:
        stmt = stmt.where(ScoringFormulaPreset.is_active.is_(True))
    rows = list((await db.scalars(stmt)).all())
    return [ScoringFormulaPresetOut.model_validate(r) for r in rows]


@router.get("/{preset_id}", response_model=ScoringFormulaPresetOut)
async def get_formula_preset(
    preset_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_staff(user)
    row = await db.get(ScoringFormulaPreset, preset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Formula şablonu tapılmadı")
    return ScoringFormulaPresetOut.model_validate(row)


@router.post("/", response_model=ScoringFormulaPresetOut)
async def create_formula_preset(
    payload: ScoringFormulaPresetCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write_staff(user)
    slug = _validate_slug(payload.slug)
    if await _get_by_slug(db, slug) is not None:
        raise HTTPException(status_code=400, detail=f"Bu slug artıq mövcuddur: {slug}")
    engine = normalize_engine(payload.engine)
    params = validate_default_params(engine, dict(payload.default_params or {}))
    entity = ScoringFormulaPreset(
        slug=slug,
        label=payload.label.strip(),
        description=payload.description,
        engine=engine,
        default_params=params,
        sort_order=int(payload.sort_order or 0),
        is_builtin=False,
        is_active=bool(payload.is_active),
        created_by_id=user.id,
    )
    db.add(entity)
    await db.commit()
    await db.refresh(entity)
    return ScoringFormulaPresetOut.model_validate(entity)


@router.put("/{preset_id}", response_model=ScoringFormulaPresetOut)
async def update_formula_preset(
    preset_id: int,
    payload: ScoringFormulaPresetUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write_staff(user)
    row = await db.get(ScoringFormulaPreset, preset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Formula şablonu tapılmadı")
    data = payload.model_dump(exclude_unset=True)

    if row.is_builtin:
        # Builtin: yalnız görünən metadata
        allowed = {"label", "description", "sort_order"}
        data = {k: v for k, v in data.items() if k in allowed}
        if "label" in data and data["label"] is not None:
            data["label"] = str(data["label"]).strip()
        for k, v in data.items():
            setattr(row, k, v)
        await db.commit()
        await db.refresh(row)
        return ScoringFormulaPresetOut.model_validate(row)

    if "slug" in data and data["slug"] is not None:
        new_slug = _validate_slug(data["slug"])
        clash = await _get_by_slug(db, new_slug)
        if clash is not None and clash.id != row.id:
            raise HTTPException(status_code=400, detail=f"Bu slug artıq mövcuddur: {new_slug}")
        data["slug"] = new_slug

    if "label" in data and data["label"] is not None:
        data["label"] = str(data["label"]).strip()

    engine = normalize_engine(data["engine"]) if "engine" in data and data["engine"] is not None else row.engine
    if "engine" in data and data["engine"] is not None:
        data["engine"] = engine
    if "default_params" in data:
        data["default_params"] = validate_default_params(engine, data["default_params"])

    for k, v in data.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return ScoringFormulaPresetOut.model_validate(row)


@router.delete("/{preset_id}")
async def deactivate_formula_preset(
    preset_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_write_staff(user)
    row = await db.get(ScoringFormulaPreset, preset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Formula şablonu tapılmadı")
    if row.is_builtin:
        raise HTTPException(status_code=400, detail="Sistem (DİM) formula şablonları silinmir")
    row.is_active = False
    await db.commit()
    return {"message": "Formula şablonu deaktiv edildi", "id": preset_id}
