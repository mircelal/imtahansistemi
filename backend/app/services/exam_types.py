"""İmtahan növləri — slug validasiyası və köməkçilər."""

from __future__ import annotations

import re

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Exam, ExamCategory, ExamScoringProfile, ExamType

SLUG_RE = re.compile(r"^[a-z0-9_]{1,32}$")


def normalize_slug(raw: str | None) -> str:
    return str(raw or "").strip().lower()


def validate_slug_format(slug: str) -> str:
    s = normalize_slug(slug)
    if not SLUG_RE.match(s):
        raise HTTPException(
            status_code=400,
            detail="Slug yalnız kiçik hərf, rəqəm və _ ola bilər (maks. 32 simvol)",
        )
    return s


async def get_exam_type_by_slug(db: AsyncSession, slug: str) -> ExamType | None:
    return await db.scalar(select(ExamType).where(ExamType.slug == normalize_slug(slug)))


async def list_active_slugs(db: AsyncSession) -> set[str]:
    rows = (await db.scalars(select(ExamType.slug).where(ExamType.is_active.is_(True)))).all()
    return {str(s) for s in rows}


async def normalize_exam_category(db: AsyncSession, raw: str | None, *, require_active: bool = True) -> str:
    """Kateqoriya/növ slug-unu yoxla — mənbə exam_types cədvəli."""
    cat = normalize_slug(raw) or ExamCategory.CUSTOM.value
    row = await get_exam_type_by_slug(db, cat)
    if row is None:
        raise HTTPException(status_code=400, detail=f"İmtahan növü tapılmadı: {cat}")
    if require_active and not row.is_active:
        raise HTTPException(status_code=400, detail=f"İmtahan növü deaktivdir: {cat}")
    return row.slug


async def count_active_usage(db: AsyncSession, slug: str) -> tuple[int, int]:
    """Aktiv imtahan və profil sayı (deaktiv qadağası üçün)."""
    from sqlalchemy import func

    exam_n = int(
        await db.scalar(
            select(func.count()).select_from(Exam).where(Exam.exam_category == slug, Exam.is_active.is_(True))
        )
        or 0
    )
    profile_n = int(
        await db.scalar(
            select(func.count())
            .select_from(ExamScoringProfile)
            .where(ExamScoringProfile.category == slug, ExamScoringProfile.is_active.is_(True))
        )
        or 0
    )
    return exam_n, profile_n


async def assert_profile_belongs_or_exists(db: AsyncSession, profile_id: int | None) -> None:
    if profile_id is None:
        return
    row = await db.get(ExamScoringProfile, int(profile_id))
    if row is None or not row.is_active:
        raise HTTPException(status_code=400, detail="Default hesablama profili tapılmadı və ya deaktivdir")
