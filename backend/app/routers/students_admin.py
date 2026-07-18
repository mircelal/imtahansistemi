from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models.entities import Course, CourseOperator, Student, User, UserRole
from app.schemas.auth import TokenResponse
from app.schemas.courses import StudentListPageOut, StudentsSummaryOut
from app.schemas.student_portal import StudentProfileOut
from app.security import create_impersonation_token
from app.services.student_profile import build_student_profile
from app.services.students_list import StudentListParams, query_students_page, query_students_summary

router = APIRouter(prefix="/api/admin/students", tags=["admin-students"])
logger = logging.getLogger(__name__)


async def _admin_accessible_course_ids(user: User, db: AsyncSession) -> list[int] | None:
    """None = bütün kurslar (admin); əks halda icazəli kurs id-ləri."""
    if user.role == UserRole.ADMIN:
        return None
    if user.role == UserRole.MANAGER:
        rows = (await db.scalars(select(Course.id).where(Course.manager_id == user.id))).all()
        return list(rows)
    if user.role == UserRole.OPERATOR:
        rows = (
            await db.scalars(select(CourseOperator.course_id).where(CourseOperator.operator_user_id == user.id))
        ).all()
        return list(rows)
    raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/summary", response_model=StudentsSummaryOut)
async def admin_students_summary(
    course_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    allowed = await _admin_accessible_course_ids(user, db)
    if user.role != UserRole.ADMIN and course_id is None:
        raise HTTPException(status_code=400, detail="Kurs seçin")
    if course_id is not None:
        from app.deps import ensure_course_access

        await ensure_course_access(course_id, user, db)
        return await query_students_summary(db, course_id=course_id)
    if allowed is not None and course_id is None:
        return await query_students_summary(db, course_ids=allowed)
    return await query_students_summary(db)


@router.get("", response_model=StudentListPageOut)
async def admin_list_students(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    course_id: int | None = None,
    search: str | None = None,
    has_login: bool | None = None,
    sort: str = Query(default="full_name", pattern="^(full_name|student_number|created_at|last_result_at)$"),
    order: str = Query(default="asc", pattern="^(asc|desc)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    allowed = await _admin_accessible_course_ids(user, db)

    if course_id is not None:
        from app.deps import ensure_course_access

        await ensure_course_access(course_id, user, db)
        params = StudentListParams(
            course_id=course_id,
            search=search,
            has_login=has_login,
            sort=sort,
            order=order,
            limit=limit,
            offset=offset,
        )
    else:
        if user.role != UserRole.ADMIN and allowed is not None and len(allowed) == 1:
            params = StudentListParams(
                course_id=allowed[0],
                search=search,
                has_login=has_login,
                sort=sort,
                order=order,
                limit=limit,
                offset=offset,
            )
        elif user.role != UserRole.ADMIN:
            if not allowed:
                return StudentListPageOut(items=[], total=0)
            params = StudentListParams(
                course_ids=allowed,
                search=search,
                has_login=has_login,
                sort=sort,
                order=order,
                limit=limit,
                offset=offset,
            )
        else:
            params = StudentListParams(
                search=search,
                has_login=has_login,
                sort=sort,
                order=order,
                limit=limit,
                offset=offset,
            )

    return await query_students_page(db, params)


@router.get("/{student_id}/profile", response_model=StudentProfileOut)
async def admin_get_student_profile(
    student_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    st = await db.get(Student, student_id)
    if st is None:
        raise HTTPException(status_code=404, detail="Şagird tapılmadı")
    from app.deps import ensure_course_access

    await ensure_course_access(st.course_id, user, db)
    return await build_student_profile(db, st)


@router.post("/{user_id}/impersonate", response_model=TokenResponse)
async def impersonate_student(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    target = await db.get(User, user_id)
    if target is None or target.role != UserRole.STUDENT:
        raise HTTPException(status_code=404, detail="Şagird kabinet hesabı tapılmadı")
    if target.linked_student_id is None:
        raise HTTPException(status_code=400, detail="Hesab şagird qeydiyyatına bağlı deyil")
    token = create_impersonation_token(str(target.id), impersonated_by=admin.id)
    logger.info(
        "impersonation admin_id=%s target_user_id=%s student_id=%s",
        admin.id,
        target.id,
        target.linked_student_id,
    )
    return TokenResponse(access_token=token)
