from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.entities import Course, Exam, ResultStatus, ScanResult, ScanSession, Student, User, UserRole
from app.schemas.student_portal import StudentProfileOut, StudentResultRowOut, StudentStatsOut, StudentSummaryOut

router = APIRouter(prefix="/api/me/student", tags=["student-portal"])


@router.get("", response_model=StudentProfileOut)
async def my_student_profile(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Şagird üçün daxili profil: imtahan tarixçəsi və statistika."""
    if user.role != UserRole.STUDENT or user.linked_student_id is None:
        raise HTTPException(status_code=403, detail="Bu məlumat yalnız şagird hesabları üçündür")

    student = await db.get(Student, user.linked_student_id)
    if student is None:
        raise HTTPException(
            status_code=404,
            detail="Şagird qeydiyyatı tapılmadı — administrator ilə əlaqə saxlayın",
        )

    home_course = await db.get(Course, student.course_id)
    course_name = (home_course.name if home_course else "") or "—"

    stmt = (
        select(ScanResult, ScanSession, Exam)
        .join(ScanSession, ScanResult.session_id == ScanSession.id)
        .join(Exam, ScanSession.exam_id == Exam.id)
        .where(ScanResult.student_id == student.id)
        .order_by(ScanResult.processed_at.desc())
    )
    rows = (await db.execute(stmt)).all()

    exam_course_ids = {ex.course_id for _, _, ex in rows if ex.course_id}
    scope_names: dict[int, str] = {}
    if exam_course_ids:
        crs_list = (await db.scalars(select(Course).where(Course.id.in_(exam_course_ids)))).all()
        scope_names = {c.id: c.name for c in crs_list}

    results_out: list[StudentResultRowOut] = []
    percents: list[float] = []
    graded_times: list[datetime] = []
    distinct_exams: set[int] = set()

    for r, _sess, ex in rows:
        distinct_exams.add(ex.id)
        if ex.course_id:
            scope_label = scope_names.get(ex.course_id) or "—"
        else:
            scope_label = "Ümumi imtahan"

        pct: float | None = None
        if (
            r.score is not None
            and r.max_score is not None
            and float(r.max_score) > 0
            and r.status != ResultStatus.ERROR
        ):
            pct = round(100.0 * float(r.score) / float(r.max_score), 2)
            percents.append(pct)
            if r.processed_at:
                graded_times.append(r.processed_at)

        results_out.append(
            StudentResultRowOut(
                scan_result_id=r.id,
                exam_id=ex.id,
                exam_title=ex.title,
                exam_scope_label=scope_label,
                score=r.score,
                max_score=r.max_score,
                percent=pct,
                status=r.status.value,
                processed_at=r.processed_at,
            )
        )

    stats = StudentStatsOut(
        total_attempts=len(rows),
        graded_attempts=len(percents),
        distinct_exams=len(distinct_exams),
        average_percent=round(sum(percents) / len(percents), 2) if percents else None,
        best_percent=max(percents) if percents else None,
        lowest_percent=min(percents) if percents else None,
        last_graded_at=max(graded_times) if graded_times else None,
    )

    summary = StudentSummaryOut(
        id=student.id,
        student_number=student.student_number,
        full_name=student.full_name,
        course_id=student.course_id,
        course_name=course_name,
    )

    return StudentProfileOut(student=summary, stats=stats, results=results_out)
