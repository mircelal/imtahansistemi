from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.entities import Student, User, UserRole
from app.schemas.student_portal import StudentExamDetailOut, StudentProfileOut
from app.services.student_profile import build_student_exam_detail, build_student_profile

router = APIRouter(prefix="/api/me/student", tags=["student-portal"])


async def _require_linked_student(user: User, db: AsyncSession) -> Student:
    if user.role != UserRole.STUDENT or user.linked_student_id is None:
        raise HTTPException(status_code=403, detail="Bu məlumat yalnız şagird hesabları üçündür")
    student = await db.get(Student, user.linked_student_id)
    if student is None:
        raise HTTPException(
            status_code=404,
            detail="Şagird qeydiyyatı tapılmadı — administrator ilə əlaqə saxlayın",
        )
    return student


@router.get("", response_model=StudentProfileOut)
async def my_student_profile(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Şagird kabineti: hesab, statistika, inkişaf trendi, fənn bölgüsü, kohort müqayisəsi."""
    student = await _require_linked_student(user, db)
    return await build_student_profile(db, student, account_user=user)


@router.get("/exams/{exam_id}", response_model=StudentExamDetailOut)
async def my_student_exam_detail(
    exam_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Tək imtahan üzrə bütün cəhdlər, fənn bölgüsü və qrup müqayisəsi."""
    student = await _require_linked_student(user, db)
    detail = await build_student_exam_detail(db, student, exam_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Bu imtahan üzrə nəticə tapılmadı")
    return detail
