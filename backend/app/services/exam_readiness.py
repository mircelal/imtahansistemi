"""İmtahan hazırlıq vəziyyəti — skan qapısı, checklist UI və API üçün vahid mənbə."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import AnswerKey, AnswerSheetTemplate, Exam, Question, Student
from app.services.grading_config import validate_grading_config
from app.services.student_resolve import template_expects_student_code


def grading_config_is_valid(cfg: dict[str, Any] | None, question_count: int) -> bool:
    try:
        validate_grading_config(dict(cfg or {}), question_count)
        return True
    except HTTPException:
        return False


async def _latest_confirmed_sheet(db: AsyncSession, exam_id: int) -> AnswerSheetTemplate | None:
    return await db.scalar(
        select(AnswerSheetTemplate)
        .where(
            AnswerSheetTemplate.exam_id == exam_id,
            AnswerSheetTemplate.is_draft.is_(False),
            AnswerSheetTemplate.pdf_path.is_not(None),
        )
        .order_by(AnswerSheetTemplate.id.desc())
    )


async def compute_exam_readiness(db: AsyncSession, exam: Exam) -> dict[str, Any]:
    """Addım-addım hazırlıq statusu və skan üçün hazır olub-olmama."""
    qc = int(exam.question_count or 0)
    exam_id = exam.id

    q_count = int(
        await db.scalar(select(func.count()).select_from(Question).where(Question.exam_id == exam_id)) or 0
    )
    ak_count = int(
        await db.scalar(select(func.count()).select_from(AnswerKey).where(AnswerKey.exam_id == exam_id)) or 0
    )
    latest_sheet = await _latest_confirmed_sheet(db, exam_id)

    student_count = 0
    if exam.course_id is not None:
        student_count = int(
            await db.scalar(select(func.count()).select_from(Student).where(Student.course_id == exam.course_id))
            or 0
        )

    needs_students = False
    if latest_sheet and latest_sheet.template_config:
        needs_students = template_expects_student_code(latest_sheet.template_config)

    has_questions = qc > 0 and q_count >= qc
    answer_key_complete = qc > 0 and ak_count >= qc
    sheet_confirmed = latest_sheet is not None
    has_course = exam.course_id is not None
    has_students = (not needs_students) or (student_count > 0)
    grading_valid = grading_config_is_valid(exam.grading_config, qc)

    steps: list[dict[str, Any]] = [
        {
            "id": "questions",
            "label": "Suallar",
            "complete": has_questions,
            "detail": f"{q_count}/{qc} sual qeydiyyatda" if qc else "Sual sayı təyin edilməyib",
        },
        {
            "id": "answer_key",
            "label": "Cavab açarı",
            "complete": answer_key_complete,
            "detail": f"{ak_count}/{qc} cavab sətiri" if qc else None,
        },
        {
            "id": "sheet_template",
            "label": "Cavab kartı şablonu",
            "complete": sheet_confirmed,
            "detail": "Təsdiqlənmiş PDF mövcuddur" if sheet_confirmed else "Təsdiqlənmiş kart PDF-i yoxdur",
        },
        {
            "id": "students",
            "label": "Şagirdlər",
            "complete": has_students,
            "detail": (
                f"Kursda {student_count} şagird"
                if needs_students and has_course
                else ("Kurs tələb olunmur" if not needs_students else "Kurs seçilməyib")
            ),
        },
        {
            "id": "grading",
            "label": "Fənn konfiqurasiyası",
            "complete": grading_valid,
            "detail": "grading_config etibarlıdır" if grading_valid else "Fənn/sual blokları yoxlanılmalıdır",
        },
    ]

    scan_prerequisites = [
        has_questions,
        answer_key_complete,
        sheet_confirmed,
        has_students,
        grading_valid,
        qc > 0,
    ]
    ready_for_scan = all(scan_prerequisites)

    missing: list[str] = []
    if qc < 1:
        missing.append("Sual sayı təyin edilməyib")
    if not has_questions:
        missing.append("Bütün suallar qeydiyyatda deyil")
    if not answer_key_complete:
        missing.append("Cavab açarı tam deyil")
    if not sheet_confirmed:
        missing.append("Təsdiqlənmiş cavab kartı PDF-i yoxdur")
    if needs_students and not has_students:
        missing.append("Kursda şagird yoxdur (kart şagird kodu tələb edir)")
    if not grading_valid:
        missing.append("Fənn konfiqurasiyası (grading_config) etibarsızdır")

    return {
        "exam_id": exam_id,
        "ready_for_scan": ready_for_scan,
        "ready_for_results": ready_for_scan,
        "steps": steps,
        "missing": missing,
        "counts": {
            "questions_registered": q_count,
            "answer_key_rows": ak_count,
            "confirmed_sheet_templates": 1 if sheet_confirmed else 0,
            "course_students": student_count,
            "question_count": qc,
        },
    }


async def assert_exam_ready_for_scan(db: AsyncSession, exam: Exam) -> None:
    """Skan sessiyası/yükləmə üçün — hazır deyilsə 422 SCAN_NOT_READY."""
    readiness = await compute_exam_readiness(db, exam)
    if readiness["ready_for_scan"]:
        return
    raise HTTPException(
        status_code=422,
        detail={
            "code": "SCAN_NOT_READY",
            "message": "İmtahan skan üçün hazır deyil",
            "missing": readiness["missing"],
            "steps": readiness["steps"],
        },
    )


async def assert_answer_key_complete(db: AsyncSession, exam: Exam) -> None:
    """Cavab kartı PDF generasiyası üçün cavab açarı tam olmalıdır."""
    qc = int(exam.question_count or 0)
    if qc < 1:
        raise HTTPException(status_code=422, detail="İmtahan üçün sual sayı təyin edilməyib")
    ak_count = int(
        await db.scalar(select(func.count()).select_from(AnswerKey).where(AnswerKey.exam_id == exam.id)) or 0
    )
    if ak_count < qc:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "ANSWER_KEY_INCOMPLETE",
                "message": "Cavab açarı tam deyil — əvvəlcə bütün suallar üçün düzgün cavabları saxlayın",
                "answer_key_rows": ak_count,
                "question_count": qc,
            },
        )
