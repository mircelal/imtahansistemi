"""Şagird kodu generasiyası və kurssuz qeydiyyat köməkçiləri."""

from __future__ import annotations

import random
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Student

_STUDENT_CODE_RE = re.compile(r"^\d{6}$")


def normalize_student_number(raw: str | None) -> str | None:
    if raw is None:
        return None
    s = raw.strip()
    if not s:
        return None
    if not _STUDENT_CODE_RE.match(s):
        raise ValueError("student_number must be exactly 6 digits")
    return s


async def allocate_platform_student_number(db: AsyncSession, preferred: str | None = None) -> str:
    """Kurssuz şagird üçün qlobal unikal 6 rəqəmli kod."""
    if preferred:
        code = normalize_student_number(preferred)
        assert code is not None
        exists = await db.scalar(
            select(Student.id).where(Student.course_id.is_(None), Student.student_number == code)
        )
        if exists is not None:
            raise ValueError("Bu kod artıq kurssuz şagird üçün istifadə olunur")
        # Also avoid colliding with any enrolled student using same number? Allow —
        # enrolled uniqueness is per-course. Platform codes are only unique among course_id IS NULL.
        return code

    for _ in range(40):
        code = f"{random.randint(0, 999999):06d}"
        exists = await db.scalar(
            select(Student.id).where(Student.course_id.is_(None), Student.student_number == code)
        )
        if exists is None:
            return code
    raise RuntimeError("Unikal şagird kodu yaradıla bilmədi")
