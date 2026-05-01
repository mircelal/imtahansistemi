from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.entities import User, UserRole
from app.schemas.auth import BootstrapAdminRequest, LoginRequest, TokenResponse, UserOut
from app.schemas.common import MessageResponse
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/bootstrap-status")
async def bootstrap_status(db: AsyncSession = Depends(get_db)):
    users_count = await db.scalar(select(func.count()).select_from(User))
    return {"needs_bootstrap": not users_count or users_count == 0}


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.post("/bootstrap-admin", response_model=UserOut)
async def bootstrap_admin(payload: BootstrapAdminRequest, db: AsyncSession = Depends(get_db)):
    users_count = await db.scalar(select(func.count()).select_from(User))
    if users_count and users_count > 0:
        raise HTTPException(status_code=400, detail="System already initialized")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role=UserRole.ADMIN,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/logout", response_model=MessageResponse)
async def logout():
    return MessageResponse(message="Logged out")


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.get("/operators", response_model=list[UserOut])
async def list_operators(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Skan oturumuna təyin üçün istifadəçilər (admin/menecer sorğusu).

    Yalnız `operator` rolunu qaytarmaq çox vaxt boş siyahı verirdi; menecer və administrator da
    oturuma təyin oluna bilər (filtr: operator öz oturumlarını, menecer kurs üzrə görür).
    """
    if current_user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=403, detail="Forbidden")
    rows = (
        await db.scalars(
            select(User).where(
                User.role.in_((UserRole.OPERATOR, UserRole.MANAGER, UserRole.ADMIN))
            )
        )
    ).all()
    prio = {UserRole.OPERATOR: 0, UserRole.MANAGER: 1, UserRole.ADMIN: 2}
    rows_sorted = sorted(
        rows,
        key=lambda u: (prio.get(u.role, 9), (u.full_name or "").lower(), u.id),
    )
    return [UserOut.model_validate(u) for u in rows_sorted]
