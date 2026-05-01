from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_admin
from app.models.entities import Student, User, UserRole
from app.schemas.auth import UserOut
from app.schemas.users_admin import AdminUserCreate
from app.security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/", response_model=list[UserOut])
async def list_users(_: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.scalars(select(User).order_by(User.id.desc()))).all()
    return [UserOut.model_validate(u) for u in rows]


@router.post("/", response_model=UserOut)
async def create_user(
    payload: AdminUserCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    exists = await db.scalar(select(User).where(User.email == payload.email))
    if exists:
        raise HTTPException(status_code=400, detail="Bu e-poçt artıq qeydiyyatdadır")
    role_map = {"admin": UserRole.ADMIN, "operator": UserRole.OPERATOR, "student": UserRole.STUDENT}
    role = role_map[payload.role]
    linked_student_id: int | None = None
    if role == UserRole.STUDENT:
        st = await db.get(Student, payload.linked_student_id)
        if st is None:
            raise HTTPException(status_code=404, detail="Şagird tapılmadı")
        taken = await db.scalar(select(User).where(User.linked_student_id == payload.linked_student_id))
        if taken is not None:
            raise HTTPException(status_code=400, detail="Bu şagird artıq başqa istifadəçi hesabına bağlıdır")
        linked_student_id = payload.linked_student_id
    user = User(
        email=payload.email,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        role=role,
        linked_student_id=linked_student_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Öz hesabınızı silə bilməzsiniz")
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="İstifadəçi tapılmadı")
    if user.role == UserRole.ADMIN:
        admin_count = await db.scalar(select(func.count()).select_from(User).where(User.role == UserRole.ADMIN))
        if admin_count is not None and admin_count <= 1:
            raise HTTPException(status_code=400, detail="Son administrator silinə bilməz")
    await db.delete(user)
    await db.commit()
    return {"ok": True}
