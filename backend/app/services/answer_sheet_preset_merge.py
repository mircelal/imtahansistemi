"""Cavab kartı üçün saxlanılmış dizayn şablonunu cari imtahan parametrləri ilə birləşdirir."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import ensure_course_access, ensure_course_write, ensure_exam_access, ensure_exam_write
from app.models.entities import AnswerSheetLayoutPreset, Exam, User, UserRole


def merge_answer_sheet_with_exam(template_cfg: dict[str, Any], exam: Exam) -> dict[str, Any]:
    """İmtahanın sual sayı və variant/sütun sayını hər zaman üstün tutur."""
    out = dict(template_cfg or {})
    out["question_count"] = int(exam.question_count or 0)
    out["options_per_question"] = int(exam.options_per_question)
    out["columns_count"] = int(exam.columns_count)
    return out


async def ensure_preset_applicable(preset_id: int, exam: Exam, user: User, db: AsyncSession) -> AnswerSheetLayoutPreset:
    preset = await db.get(AnswerSheetLayoutPreset, preset_id)
    if preset is None:
        raise HTTPException(status_code=404, detail="Cavab kartı şablonu tapılmadı")
    if not preset.is_active:
        raise HTTPException(status_code=400, detail="Bu şablon qeyri-aktivdir")
    if exam.course_id is None:
        if preset.course_id is not None:
            raise HTTPException(
                status_code=400,
                detail="Ümumi (kurssuz) imtahan üçün yalnız ümumi cavab kartı şablonu seçilə bilər",
            )
    else:
        if preset.course_id is not None and preset.course_id != exam.course_id:
            raise HTTPException(status_code=400, detail="Şablon bu imtahanın kursuna uyğun deyil")
    return preset


async def build_merged_answer_sheet_config(
    *,
    db: AsyncSession,
    user: User,
    exam_id: int,
    template_config: dict[str, Any] | None,
    layout_preset_id: int | None,
    require_write: bool,
) -> tuple[dict[str, Any], Exam, int | None]:
    """effective_preset_id — yaradılmış PDF sırasında audit üçün saxlanılır."""
    if require_write:
        exam_row = await ensure_exam_write(exam_id, user, db)
    else:
        exam_row = await ensure_exam_access(exam_id, user, db)

    effective_pid = layout_preset_id
    if effective_pid is None:
        effective_pid = exam_row.answer_sheet_preset_id

    base: dict[str, Any] = {}
    if effective_pid is not None:
        preset = await ensure_preset_applicable(effective_pid, exam_row, user, db)
        base = dict(preset.template_config or {})

    if template_config:
        if effective_pid is not None:
            base.update(dict(template_config))
        else:
            base = dict(template_config)
    elif effective_pid is None:
        raise HTTPException(
            status_code=400,
            detail="template_config və ya seçilmiş cavab kartı şablonu (layout_preset_id / imtahan bağlantısı) lazımdır",
        )

    merged = merge_answer_sheet_with_exam(base, exam_row)
    return merged, exam_row, effective_pid


async def ensure_preset_library_write(preset: AnswerSheetLayoutPreset, user: User, db: AsyncSession) -> None:
    """Şablon dəyişikliyi — ümumi şablonlar yalnız admin; kurs şablonları — kurs yazma icazəsi."""
    if preset.course_id is None:
        if user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Ümumi şablonları yalnız administrator dəyişə bilər")
        return
    await ensure_course_write(preset.course_id, user, db)


async def ensure_preset_library_read_list(user: User, db: AsyncSession, course_id: int | None) -> None:
    """Siyahı üçün minimal yoxlama: konkret kurs seçilibsə çıxış."""
    if course_id is not None:
        from app.deps import ensure_course_access

        await ensure_course_access(course_id, user, db)


async def count_exams_using_preset(db: AsyncSession, preset_id: int) -> int:
    return int(
        await db.scalar(select(func.count()).select_from(Exam).where(Exam.answer_sheet_preset_id == preset_id)) or 0
    )


async def validate_exam_preset_assignment(
    db: AsyncSession, *, course_id: int | None, preset_id: int | None
) -> None:
    """İmtahan yaradılarkən/yenilənərkən seçilmiş şablon uyğunluğu."""
    if preset_id is None:
        return
    preset = await db.get(AnswerSheetLayoutPreset, preset_id)
    if preset is None:
        raise HTTPException(status_code=400, detail="Cavab kartı şablonu tapılmadı")
    if not preset.is_active:
        raise HTTPException(status_code=400, detail="Seçilmiş cavab kartı şablonu qeyri-aktivdir")
    if course_id is None:
        if preset.course_id is not None:
            raise HTTPException(status_code=400, detail="Ümumi imtahan üçün yalnız ümumi cavab kartı şablonu seçilə bilər")
    else:
        if preset.course_id is not None and preset.course_id != course_id:
            raise HTTPException(status_code=400, detail="Şablon seçilmiş kursa uyğun deyil")
