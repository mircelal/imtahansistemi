import csv
import uuid
from io import StringIO

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.deps import (
    ensure_course_access,
    ensure_course_manager_or_admin,
    ensure_course_write,
    get_current_user,
    require_admin,
)
from app.models.entities import Course, CourseOperator, Student, User, UserRole, WalletTransaction
from app.schemas.auth import UserOut
from app.schemas.courses import (
    CourseCreate,
    CourseDashboardOut,
    CourseDashboardPlatformExam,
    CourseOperatorAttachRequest,
    CourseOperatorInviteRequest,
    CourseOperatorMemberOut,
    CourseOut,
    CourseUpdate,
    CourseWalletAdjustRequest,
    CourseWalletOut,
    CourseWalletTransactionOut,
    StudentCreate,
    StudentListPageOut,
    StudentLoginCreate,
    StudentOut,
    StudentPasswordReset,
    StudentsSummaryOut,
    StudentUpdate,
)
from app.schemas.student_portal import StudentProfileOut
from app.security import hash_password
from app.services.course_dashboard import build_course_dashboard, list_platform_exams_for_course
from app.services.course_wallet import (
    adjust_wallet_balance,
    amount_to_cents,
    cents_to_amount,
    course_revenue_stats,
    ensure_course_wallet,
)
from app.services.storage import StorageService
from app.services.student_profile import build_student_profile
from app.services.students_list import StudentListParams, query_students_page, query_students_summary

router = APIRouter(prefix="/api/courses", tags=["courses"])
_settings = get_settings()
_MAX_LOGO = 2 * 1024 * 1024
_ALLOWED_LOGO = frozenset({"image/png", "image/jpeg", "image/webp"})


def _course_out(row: Course) -> CourseOut:
    return CourseOut(
        id=row.id,
        name=row.name,
        description=row.description,
        manager_id=row.manager_id,
        has_logo=bool(row.logo_object_key),
        created_at=row.created_at,
        is_active=row.is_active,
    )


@router.get("/", response_model=list[CourseOut])
async def list_courses(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(Course).order_by(Course.id.desc())
    if user.role == UserRole.MANAGER:
        query = query.where(Course.manager_id == user.id)
    elif user.role == UserRole.OPERATOR:
        assigned = select(CourseOperator.course_id).where(CourseOperator.operator_user_id == user.id)
        query = query.where(Course.id.in_(assigned))
    elif user.role == UserRole.STUDENT:
        return []
    rows = (await db.scalars(query)).all()
    return [_course_out(row) for row in rows]


@router.post("/", response_model=CourseOut)
async def create_course(
    payload: CourseCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    data = payload.model_dump()
    if user.role == UserRole.MANAGER:
        data["manager_id"] = user.id
    elif user.role == UserRole.ADMIN:
        pass
    else:
        raise HTTPException(status_code=403, detail="Forbidden")
    entity = Course(**data)
    db.add(entity)
    await db.commit()
    await db.refresh(entity)
    from app.services.course_wallet import ensure_course_wallet

    await ensure_course_wallet(db, entity.id)
    await db.commit()
    return _course_out(entity)


@router.post("/{course_id}/logo")
async def upload_course_logo(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    file: UploadFile = File(...),
):
    row = await ensure_course_write(course_id, user, db)
    if not file.content_type or file.content_type not in _ALLOWED_LOGO:
        raise HTTPException(status_code=400, detail="Yalnız PNG, JPEG və ya WEBP qəbul edilir")
    raw = await file.read()
    if len(raw) > _MAX_LOGO:
        raise HTTPException(status_code=400, detail="Logo çox böyükdür (max 2 MB)")
    ext = ".png"
    if file.content_type == "image/jpeg":
        ext = ".jpg"
    elif file.content_type == "image/webp":
        ext = ".webp"
    object_name = f"course-{course_id}/logo-{uuid.uuid4().hex}{ext}"
    StorageService().upload_bytes(_settings.minio_bucket_uploads, object_name, raw, file.content_type)
    row.logo_object_key = object_name
    row.logo_content_type = file.content_type
    await db.commit()
    await db.refresh(row)
    return {"ok": True, "has_logo": bool(row.logo_object_key)}


@router.delete("/{course_id}/logo")
async def delete_course_logo(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = await ensure_course_write(course_id, user, db)
    row.logo_object_key = None
    row.logo_content_type = None
    await db.commit()
    return {"ok": True}


@router.get("/{course_id}/logo")
async def download_course_logo(course_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await ensure_course_access(course_id, user, db)
    if not row.logo_object_key:
        raise HTTPException(status_code=404, detail="Logo yoxdur")
    storage = StorageService()
    try:
        data = storage.get_bytes(_settings.minio_bucket_uploads, row.logo_object_key)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Logo oxuna bilmədi") from exc
    ct = row.logo_content_type or "image/png"
    return Response(content=data, media_type=ct)


@router.get("/{course_id}/operators", response_model=list[CourseOperatorMemberOut])
async def list_course_operators(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_course_manager_or_admin(course_id, user, db)
    stmt = (
        select(User)
        .join(CourseOperator, CourseOperator.operator_user_id == User.id)
        .where(CourseOperator.course_id == course_id)
        .order_by(User.full_name, User.id)
    )
    rows = (await db.scalars(stmt)).all()
    return [CourseOperatorMemberOut(user_id=u.id, email=u.email, full_name=u.full_name) for u in rows]


@router.post("/{course_id}/operators", response_model=CourseOperatorMemberOut)
async def attach_course_operator(
    course_id: int,
    payload: CourseOperatorAttachRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_course_manager_or_admin(course_id, user, db)
    op_user = await db.get(User, payload.operator_user_id)
    if op_user is None or op_user.role != UserRole.OPERATOR:
        raise HTTPException(status_code=400, detail="Yalnız operator rolundakı istifadəçi təyin oluna bilər")
    exists = await db.scalar(
        select(CourseOperator.course_id).where(
            CourseOperator.course_id == course_id,
            CourseOperator.operator_user_id == payload.operator_user_id,
        )
    )
    if exists is not None:
        raise HTTPException(status_code=400, detail="Bu operator artıq bu kursa təyin olunub")
    db.add(CourseOperator(course_id=course_id, operator_user_id=payload.operator_user_id))
    await db.commit()
    return CourseOperatorMemberOut(user_id=op_user.id, email=op_user.email, full_name=op_user.full_name)


@router.post("/{course_id}/operators/invite", response_model=CourseOperatorMemberOut)
async def invite_course_operator(
    course_id: int,
    payload: CourseOperatorInviteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_course_manager_or_admin(course_id, user, db)
    dup = await db.scalar(select(User).where(User.email == payload.email))
    if dup is not None:
        raise HTTPException(status_code=400, detail="Bu e-poçt artıq sistemdə qeydiyyatdadır — mövcud operatoru təyin edin")
    op_user = User(
        email=payload.email,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        role=UserRole.OPERATOR,
    )
    db.add(op_user)
    await db.flush()
    db.add(CourseOperator(course_id=course_id, operator_user_id=op_user.id))
    await db.commit()
    await db.refresh(op_user)
    return CourseOperatorMemberOut(user_id=op_user.id, email=op_user.email, full_name=op_user.full_name)


@router.delete("/{course_id}/operators/{operator_user_id}")
async def detach_course_operator(
    course_id: int,
    operator_user_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_course_manager_or_admin(course_id, user, db)
    row = (
        await db.scalars(
            select(CourseOperator).where(
                CourseOperator.course_id == course_id,
                CourseOperator.operator_user_id == operator_user_id,
            )
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Təyinat tapılmadı")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/{course_id}/dashboard", response_model=CourseDashboardOut)
async def get_course_dashboard(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = await ensure_course_access(course_id, user, db)
    return await build_course_dashboard(db, row)


@router.get("/{course_id}/wallet", response_model=CourseWalletOut)
async def get_course_wallet(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_course_access(course_id, user, db)
    stats = await course_revenue_stats(db, course_id)
    wallet = await ensure_course_wallet(db, course_id)
    return CourseWalletOut(
        course_id=course_id,
        balance=stats["wallet_balance"],
        currency=stats["wallet_currency"],
        revenue_total=stats["revenue_total"],
        revenue_today=stats["revenue_today"],
        tickets_sold_total=stats["tickets_sold_total"],
        updated_at=wallet.updated_at,
    )


@router.get("/{course_id}/wallet/transactions", response_model=list[CourseWalletTransactionOut])
async def list_course_wallet_transactions(
    course_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_course_access(course_id, user, db)
    rows = (
        await db.scalars(
            select(WalletTransaction)
            .where(WalletTransaction.course_id == course_id)
            .order_by(WalletTransaction.id.desc())
            .limit(limit)
        )
    ).all()
    user_ids = {r.created_by for r in rows if r.created_by}
    names: dict[int, str] = {}
    if user_ids:
        for u in (await db.scalars(select(User).where(User.id.in_(user_ids)))).all():
            names[u.id] = u.full_name or u.email
    return [
        CourseWalletTransactionOut(
            id=r.id,
            amount=cents_to_amount(r.amount_cents),
            amount_cents=r.amount_cents,
            tx_type=r.tx_type,
            ref_type=r.ref_type,
            ref_id=r.ref_id,
            note=r.note,
            created_at=r.created_at,
            created_by_name=names.get(r.created_by) if r.created_by else None,
        )
        for r in rows
    ]


@router.post("/{course_id}/wallet/adjust", response_model=CourseWalletOut)
async def adjust_course_wallet(
    course_id: int,
    payload: CourseWalletAdjustRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    await ensure_course_access(course_id, user, db)
    cents = amount_to_cents(payload.amount)
    if cents == 0:
        raise HTTPException(status_code=400, detail="Məbləğ sıfır ola bilməz")
    await adjust_wallet_balance(db, course_id=course_id, amount_cents=cents, created_by=user.id, note=payload.note)
    await db.commit()
    stats = await course_revenue_stats(db, course_id)
    wallet = await ensure_course_wallet(db, course_id)
    return CourseWalletOut(
        course_id=course_id,
        balance=stats["wallet_balance"],
        currency=stats["wallet_currency"],
        revenue_total=stats["revenue_total"],
        revenue_today=stats["revenue_today"],
        tickets_sold_total=stats["tickets_sold_total"],
        updated_at=wallet.updated_at,
    )


@router.get("/{course_id}/platform-exams", response_model=list[CourseDashboardPlatformExam])
async def get_course_platform_exams(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_course_access(course_id, user, db)
    return await list_platform_exams_for_course(db, course_id)


@router.get("/{course_id}", response_model=CourseOut)
async def get_course(
    course_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    row = await ensure_course_access(course_id, user, db)
    return _course_out(row)


@router.put("/{course_id}", response_model=CourseOut)
async def update_course(
    course_id: int,
    payload: CourseUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = await ensure_course_write(course_id, user, db)
    data = payload.model_dump(exclude_unset=True)
    if user.role == UserRole.OPERATOR and "manager_id" in data:
        raise HTTPException(status_code=403, detail="Menecer dəyişdirilə bilməz")
    if user.role == UserRole.MANAGER and payload.manager_id is not None and payload.manager_id != user.id:
        raise HTTPException(status_code=403, detail="Cannot reassign course manager")
    for key, value in data.items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return _course_out(row)


@router.delete("/{course_id}")
async def delete_course(course_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == UserRole.OPERATOR:
        raise HTTPException(status_code=403, detail="Kursu yalnız administrator və ya menecer silə bilər")
    row = await ensure_course_write(course_id, user, db)
    await db.delete(row)
    await db.commit()
    return {"message": "Deleted"}


@router.get("/{course_id}/students/summary", response_model=StudentsSummaryOut)
async def students_summary(
    course_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    await ensure_course_access(course_id, user, db)
    return await query_students_summary(db, course_id=course_id)


@router.get("/{course_id}/students", response_model=StudentListPageOut)
async def list_students(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    search: str | None = None,
    has_login: bool | None = None,
    sort: str = Query(default="full_name", pattern="^(full_name|student_number|created_at|last_result_at)$"),
    order: str = Query(default="asc", pattern="^(asc|desc)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
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
    return await query_students_page(db, params)


@router.get("/{course_id}/students/{student_id}/profile", response_model=StudentProfileOut)
async def get_student_profile(
    course_id: int,
    student_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_course_access(course_id, user, db)
    st = await db.get(Student, student_id)
    if st is None or st.course_id != course_id:
        raise HTTPException(status_code=404, detail="Şagird tapılmadı")
    return await build_student_profile(db, st)


@router.patch("/{course_id}/students/{student_id}", response_model=StudentOut)
async def update_student(
    course_id: int,
    student_id: int,
    payload: StudentUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_course_write(course_id, user, db)
    st = await db.get(Student, student_id)
    if st is None or st.course_id != course_id:
        raise HTTPException(status_code=404, detail="Şagird tapılmadı")
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="Yenilənəcək sahə yoxdur")
    for key, value in data.items():
        setattr(st, key, value)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Bu kursda eyni 6 rəqəmli kod artıq mövcuddur") from exc
    await db.refresh(st)
    login_user = await db.scalar(select(User).where(User.linked_student_id == st.id))
    return StudentOut(
        id=st.id,
        course_id=st.course_id,
        student_number=st.student_number,
        full_name=st.full_name,
        created_at=st.created_at,
        login_user_id=login_user.id if login_user else None,
        login_email=login_user.email if login_user else None,
    )


@router.delete("/{course_id}/students/{student_id}")
async def delete_student(
    course_id: int,
    student_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_course_write(course_id, user, db)
    st = await db.get(Student, student_id)
    if st is None or st.course_id != course_id:
        raise HTTPException(status_code=404, detail="Şagird tapılmadı")
    login_user = await db.scalar(select(User).where(User.linked_student_id == student_id))
    if login_user is not None:
        raise HTTPException(
            status_code=409,
            detail="Əvvəlcə kabinet hesabını silin, sonra şagird qeydiyyatını silə bilərsiniz",
        )
    await db.delete(st)
    await db.commit()
    return {"ok": True}


@router.delete("/{course_id}/students/{student_id}/login")
async def delete_student_login(
    course_id: int,
    student_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_course_write(course_id, user, db)
    st = await db.get(Student, student_id)
    if st is None or st.course_id != course_id:
        raise HTTPException(status_code=404, detail="Şagird tapılmadı")
    login_user = await db.scalar(select(User).where(User.linked_student_id == student_id))
    if login_user is None:
        raise HTTPException(status_code=404, detail="Kabinet hesabı yoxdur")
    await db.delete(login_user)
    await db.commit()
    return {"ok": True}


@router.post("/{course_id}/students/{student_id}/reset-password")
async def reset_student_password(
    course_id: int,
    student_id: int,
    payload: StudentPasswordReset,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_course_write(course_id, user, db)
    st = await db.get(Student, student_id)
    if st is None or st.course_id != course_id:
        raise HTTPException(status_code=404, detail="Şagird tapılmadı")
    login_user = await db.scalar(select(User).where(User.linked_student_id == student_id))
    if login_user is None:
        raise HTTPException(status_code=404, detail="Kabinet hesabı yoxdur")
    login_user.password_hash = hash_password(payload.password)
    await db.commit()
    return {"ok": True}


@router.post("/{course_id}/students", response_model=StudentOut)
async def add_student(
    course_id: int,
    payload: StudentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_course_write(course_id, user, db)
    entity = Student(course_id=course_id, **payload.model_dump())
    db.add(entity)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Bu kursda eyni 6 rəqəmli kod artıq mövcuddur",
        ) from exc
    await db.refresh(entity)
    return StudentOut.model_validate(entity)


@router.post("/{course_id}/students/{student_id}/login", response_model=UserOut)
async def create_student_login(
    course_id: int,
    student_id: int,
    payload: StudentLoginCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Kurs şagirdi üçün kabinet (login) hesabı — qeydiyyat + istifadəçi bir yerdə idarə olunur."""
    await ensure_course_write(course_id, user, db)
    st = await db.get(Student, student_id)
    if st is None or st.course_id != course_id:
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
        raise HTTPException(status_code=400, detail="Kabinet yaradılmadı — e-poçt və ya şagird bağlantısı artıq mövcuddur") from exc
    await db.refresh(login_user)
    return UserOut.model_validate(login_user)


@router.post("/{course_id}/students/bulk", response_model=dict)
async def add_students_bulk(
    course_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_course_write(course_id, user, db)
    content = (await file.read()).decode("utf-8")
    reader = csv.DictReader(StringIO(content))
    count = 0
    for row in reader:
        payload = StudentCreate(student_number=row["student_number"], full_name=row["full_name"])
        db.add(Student(course_id=course_id, student_number=payload.student_number, full_name=payload.full_name))
        count += 1
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail="CSV-də təkrarlanan və ya mövcud şagird kodu var",
        ) from exc
    return {"inserted": count}
