import csv
import uuid
from io import StringIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
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
)
from app.models.entities import Course, CourseOperator, Student, User, UserRole
from app.schemas.courses import (
    CourseCreate,
    CourseOperatorAttachRequest,
    CourseOperatorInviteRequest,
    CourseOperatorMemberOut,
    CourseOut,
    CourseUpdate,
    StudentCreate,
    StudentOut,
)
from app.security import hash_password
from app.services.storage import StorageService

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


@router.get("/{course_id}/students", response_model=list[StudentOut])
async def list_students(
    course_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    await ensure_course_access(course_id, user, db)
    rows = (await db.scalars(select(Student).where(Student.course_id == course_id))).all()
    return [StudentOut.model_validate(row) for row in rows]


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
