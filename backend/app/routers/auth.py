import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from jose import JWTError, jwt
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user, oauth2_scheme
from app.limiter import limiter
from app.models.entities import User, UserRole
from app.schemas.auth import BootstrapAdminRequest, LoginRequest, TokenResponse, UserOut
from app.schemas.common import MessageResponse
from app.security import create_access_token, hash_password, verify_password
from app.services.auth_security import (
    clear_login_failures,
    denylist_token,
    is_login_locked,
    record_login_failure,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()

# Advisory lock key for first-admin bootstrap (empty-table race)
_BOOTSTRAP_ADVISORY_LOCK = 87001601


def _bootstrap_token_ok(provided: str | None, expected: str) -> bool:
    if not provided:
        return False
    if len(provided) != len(expected):
        return False
    return secrets.compare_digest(provided, expected)


@router.get("/bootstrap-status")
async def bootstrap_status(db: AsyncSession = Depends(get_db)):
    users_count = await db.scalar(select(func.count()).select_from(User))
    return {"needs_bootstrap": not users_count or users_count == 0}


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    if is_login_locked(payload.email):
        raise HTTPException(status_code=429, detail="Too many failed login attempts; try again later")
    user = await db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.password_hash):
        record_login_failure(payload.email)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    clear_login_failures(payload.email)
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.post("/bootstrap-admin", response_model=UserOut)
@limiter.limit("5/hour")
async def bootstrap_admin(
    request: Request,
    payload: BootstrapAdminRequest,
    db: AsyncSession = Depends(get_db),
    x_bootstrap_token: str | None = Header(default=None, alias="X-Bootstrap-Token"),
):
    expected = (settings.bootstrap_setup_token or "").strip() or None
    if expected:
        provided = (x_bootstrap_token or payload.setup_token or "").strip() or None
        if not _bootstrap_token_ok(provided, expected):
            raise HTTPException(status_code=403, detail="Invalid or missing bootstrap setup token")

    # Serialize bootstrap across concurrent requests (empty table has no row locks)
    await db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _BOOTSTRAP_ADVISORY_LOCK})
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
async def logout(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return MessageResponse(message="Logged out")
    jti = payload.get("jti")
    exp = payload.get("exp")
    if jti and exp is not None:
        now = int(datetime.now(timezone.utc).timestamp())
        ttl = max(1, int(exp) - now)
        denylist_token(str(jti), ttl_seconds=ttl)
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
