import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from jose import JWTError, jwt
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user, oauth2_scheme
from app.limiter import limiter
from app.models.entities import Student, User, UserRole
from app.schemas.auth import (
    BootstrapAdminRequest,
    LoginRequest,
    RefreshRequest,
    StudentRegisterRequest,
    TokenResponse,
    UserOut,
    user_out,
)
from app.schemas.common import MessageResponse
from app.security import (
    hash_password,
    issue_token_pair,
    revoke_all_user_refresh_tokens,
    revoke_refresh_token,
    rotate_refresh_token,
    verify_password,
)
from app.services.audit import write_audit
from app.services.auth_security import (
    clear_login_failures,
    denylist_token,
    is_login_locked,
    record_login_failure,
)
from app.services.fin_identity import synthetic_email_for_fin
from app.services.student_codes import allocate_platform_student_number

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()

_BOOTSTRAP_ADVISORY_LOCK = 87001601


def _bootstrap_token_ok(provided: str | None, expected: str) -> bool:
    if not provided:
        return False
    if len(provided) != len(expected):
        return False
    return secrets.compare_digest(provided, expected)


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    if request.client:
        return (request.client.host or "")[:64] or None
    return None


def _token_response(access: str, refresh: str | None = None) -> TokenResponse:
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.get("/bootstrap-status")
async def bootstrap_status(db: AsyncSession = Depends(get_db)):
    users_count = await db.scalar(select(func.count()).select_from(User))
    return {"needs_bootstrap": not users_count or users_count == 0}


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    lock_key = str(payload.email or payload.fin_code or "")
    if is_login_locked(lock_key):
        raise HTTPException(status_code=429, detail="Too many failed login attempts; try again later")

    user: User | None = None
    if payload.fin_code:
        user = await db.scalar(select(User).where(User.fin_code == payload.fin_code))
    elif payload.email:
        user = await db.scalar(select(User).where(User.email == str(payload.email)))

    if (
        user is None
        or user.deleted_at is not None
        or not verify_password(payload.password, user.password_hash)
    ):
        record_login_failure(lock_key)
        await write_audit(
            db,
            action="login_failed",
            ip_address=_client_ip(request),
            meta={"fin_code": payload.fin_code, "email": str(payload.email) if payload.email else None},
        )
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")

    clear_login_failures(lock_key)
    access, refresh = await issue_token_pair(
        db,
        user,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )
    await write_audit(
        db,
        action="login_ok",
        actor_user_id=user.id,
        ip_address=_client_ip(request),
        meta={"via": "fin" if payload.fin_code else "email"},
    )
    await db.commit()
    return _token_response(access, refresh)


@router.post("/register-student", response_model=TokenResponse)
@limiter.limit("5/minute")
async def register_student(
    request: Request,
    payload: StudentRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Şagird özü qeydiyyat — FIN və/və ya email + şifrə."""
    fin = payload.fin_code
    if fin:
        exists_fin = await db.scalar(select(User.id).where(User.fin_code == fin))
        if exists_fin:
            raise HTTPException(status_code=400, detail="Bu FIN artıq qeydiyyatdadır")

    if payload.email:
        email = str(payload.email)
    elif fin:
        email = synthetic_email_for_fin(fin)
    else:
        raise HTTPException(status_code=400, detail="fin_code və ya email tələb olunur")

    exists_email = await db.scalar(select(User.id).where(User.email == email))
    if exists_email:
        raise HTTPException(status_code=400, detail="Bu e-poçt artıq qeydiyyatdadır")

    try:
        code = await allocate_platform_student_number(db, payload.student_number)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    student = Student(
        course_id=None,
        student_number=code,
        full_name=payload.full_name.strip(),
    )
    db.add(student)
    try:
        await db.flush()
        user = User(
            email=email,
            full_name=payload.full_name.strip(),
            password_hash=hash_password(payload.password),
            role=UserRole.STUDENT,
            fin_code=fin,
            phone=payload.phone,
            preferred_region_id=payload.preferred_region_id,
            preferred_area_id=payload.preferred_area_id,
            linked_student_id=student.id,
        )
        db.add(user)
        await db.flush()
        access, refresh = await issue_token_pair(
            db,
            user,
            user_agent=request.headers.get("user-agent"),
            ip_address=_client_ip(request),
        )
        await write_audit(
            db,
            action="student_register",
            actor_user_id=user.id,
            resource_type="user",
            resource_id=user.id,
            ip_address=_client_ip(request),
            meta={"fin_code": fin} if fin else {"email": email},
        )
        await db.commit()
        await db.refresh(user)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=400, detail="Qeydiyyat alınmadı — FIN, e-poçt və ya kod təkrarlanır"
        ) from exc

    return _token_response(access, refresh)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
async def refresh_tokens(
    request: Request,
    payload: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        _user, access, refresh = await rotate_refresh_token(
            db,
            payload.refresh_token,
            user_agent=request.headers.get("user-agent"),
            ip_address=_client_ip(request),
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    await db.commit()
    return _token_response(access, refresh)


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
    return user_out(user)


@router.post("/logout", response_model=MessageResponse)
async def logout(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    refresh_token: str | None = Header(default=None, alias="X-Refresh-Token"),
):
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
    await revoke_refresh_token(db, refresh_token)
    body = None
    try:
        body = await request.json()
    except Exception:
        body = None
    if isinstance(body, dict) and body.get("refresh_token"):
        await revoke_refresh_token(db, str(body["refresh_token"]))
    await db.commit()
    return MessageResponse(message="Logged out")


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    if current_user.deleted_at is not None:
        raise HTTPException(status_code=401, detail="Account deleted")
    return user_out(current_user)


@router.delete("/me", response_model=MessageResponse)
async def delete_my_account(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """App Store / Play compliance — soft delete + revoke sessions."""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Yalnız şagird hesabı silinə bilər")
    current_user.deleted_at = datetime.utcnow()
    current_user.email = f"deleted+{current_user.id}@deleted.local"
    current_user.fin_code = None
    current_user.phone = None
    await revoke_all_user_refresh_tokens(db, current_user.id)
    await write_audit(
        db,
        action="account_delete",
        actor_user_id=current_user.id,
        resource_type="user",
        resource_id=current_user.id,
        ip_address=_client_ip(request),
    )
    await db.commit()
    return MessageResponse(message="Hesab silindi")


@router.get("/operators", response_model=list[UserOut])
async def list_operators(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=403, detail="Forbidden")
    rows = (
        await db.scalars(
            select(User).where(
                User.role.in_((UserRole.OPERATOR, UserRole.MANAGER, UserRole.ADMIN)),
                User.deleted_at.is_(None),
            )
        )
    ).all()
    prio = {UserRole.OPERATOR: 0, UserRole.MANAGER: 1, UserRole.ADMIN: 2}
    rows_sorted = sorted(
        rows,
        key=lambda u: (prio.get(u.role, 9), (u.full_name or "").lower(), u.id),
    )
    return [user_out(u) for u in rows_sorted]


@router.get("/sima/status")
async def sima_status():
    """Phase 3 stub — SİMA optional login adapter availability."""
    return {
        "enabled": bool(settings.sima_enabled and settings.sima_client_id),
        "auth_url": settings.sima_auth_url if settings.sima_enabled else None,
        "message": "SİMA inteqrasiyası hazırlanır" if not settings.sima_enabled else "SİMA aktiv",
    }
