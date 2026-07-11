"""İmtahan/sual dəyişikliyində saxlanmış OMR şablon keşini köhnəlmiş kimi işarələ."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import AnswerSheetTemplate


async def mark_exam_omr_templates_stale(db: AsyncSession, exam_id: int) -> None:
    rows = (
        await db.scalars(select(AnswerSheetTemplate).where(AnswerSheetTemplate.exam_id == exam_id))
    ).all()
    for row in rows:
        if not row.template_config:
            continue
        cfg = dict(row.template_config)
        if cfg.get("_omr_template_stale"):
            continue
        cfg["_omr_template_stale"] = True
        row.template_config = cfg
