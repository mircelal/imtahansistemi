from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models.entities import Course, CourseOperator, Student, User, UserRole
from app.schemas.courses import (
    AdminStudentCreate,
    StudentAssignCourse,
    StudentListPageOut,
    StudentLoginCreate,
    StudentOut,
    StudentsSummaryOut,
)
from app.schemas.student_portal import StudentProfileOut
from app.security import create_impersonation_token, hash_password
from app.services.student_codes import allocate_platform_student_number
from app.services.fin_identity import synthetic_email_for_fin
from app.services.student_profile import build_student_profile
from app.services.students_list import StudentListParams, query_students_page, query_students_summary
from app.schemas.auth import TokenResponse, UserOut
from sqlalchemy.exc import IntegrityError

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
    if st.course_id is None:
        if user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Kurssuz şagird yalnız admin üçün")
    else:
        from app.deps import ensure_course_access

        await ensure_course_access(st.course_id, user, db)
    return await build_student_profile(db, st)


@router.post("", response_model=StudentOut)
async def admin_create_student(
    payload: AdminStudentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin: kurssuz və ya kurs ilə şagird; istəyə bağlı e-poçt/şifrə ilə kabinet."""
    if payload.course_id is not None:
        course = await db.get(Course, payload.course_id)
        if course is None:
            raise HTTPException(status_code=404, detail="Kurs tapılmadı")
        if not payload.student_number:
            raise HTTPException(status_code=400, detail="Kurs ilə yaradarkən 6 rəqəmli kod lazımdır")
        code = payload.student_number
        # Prefer enrolling orphan with same code
        orphan = await db.scalar(
            select(Student).where(Student.course_id.is_(None), Student.student_number == code)
        )
        if orphan is not None:
            orphan.course_id = payload.course_id
            orphan.full_name = payload.full_name.strip()
            entity = orphan
        else:
            entity = Student(
                course_id=payload.course_id,
                student_number=code,
                full_name=payload.full_name.strip(),
            )
            db.add(entity)
    else:
        try:
            code = await allocate_platform_student_number(db, payload.student_number)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        entity = Student(
            course_id=None,
            student_number=code,
            full_name=payload.full_name.strip(),
        )
        db.add(entity)

    create_login = bool(payload.password and (payload.email or payload.fin_code))
    if create_login:
        if payload.fin_code:
            exists_fin = await db.scalar(select(User.id).where(User.fin_code == payload.fin_code))
            if exists_fin:
                raise HTTPException(status_code=400, detail="Bu FIN artıq qeydiyyatdadır")
        email = str(payload.email) if payload.email else synthetic_email_for_fin(payload.fin_code or "")
        exists = await db.scalar(select(User).where(User.email == email))
        if exists:
            raise HTTPException(status_code=400, detail="Bu e-poçt artıq qeydiyyatdadır")
    else:
        email = None

    try:
        await db.flush()
        if create_login and email:
            login_user = User(
                email=email,
                full_name=payload.full_name.strip(),
                password_hash=hash_password(payload.password or ""),
                role=UserRole.STUDENT,
                linked_student_id=entity.id,
                fin_code=payload.fin_code,
            )
            db.add(login_user)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Şagird yaradılmadı — kod, FIN və ya e-poçt təkrarlanır") from exc
    await db.refresh(entity)
    return StudentOut.model_validate(entity)


@router.post("/{student_id}/assign-course", response_model=StudentOut)
async def admin_assign_course(
    student_id: int,
    payload: StudentAssignCourse,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    st = await db.get(Student, student_id)
    if st is None:
        raise HTTPException(status_code=404, detail="Şagird tapılmadı")
    course = await db.get(Course, payload.course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Kurs tapılmadı")
    conflict = await db.scalar(
        select(Student.id).where(
            Student.course_id == payload.course_id,
            Student.student_number == st.student_number,
            Student.id != st.id,
        )
    )
    if conflict is not None:
        raise HTTPException(status_code=400, detail="Bu kursda eyni kod artıq var")
    st.course_id = payload.course_id
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Kursa yazıla bilmədi") from exc
    await db.refresh(st)
    return StudentOut.model_validate(st)


@router.post("/{student_id}/login", response_model=UserOut)
async def admin_create_student_login(
    student_id: int,
    payload: StudentLoginCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    st = await db.get(Student, student_id)
    if st is None:
        raise HTTPException(status_code=404, detail="Şagird tapılmadı")
    taken = await db.scalar(select(User).where(User.linked_student_id == student_id))
    if taken is not None:
        raise HTTPException(status_code=400, detail="Bu şagirdin artıq kabinet hesabı var")
    exists = await db.scalar(select(User).where(User.email == payload.email))
    if exists:
        raise HTTPException(status_code=400, detail="Bu e-poçt artıq qeydiyyatdadır")
    display_name = (payload.full_name or st.full_name).strip()
    login_user = User(
        email=payload.email,
        full_name=display_name,
        password_hash=hash_password(payload.password),
        role=UserRole.STUDENT,
        linked_student_id=student_id,
    )
    db.add(login_user)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Kabinet yaradılmadı") from exc
    await db.refresh(login_user)
    return UserOut.model_validate(login_user)


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
