"""Access + refresh token helpers."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.entities import RefreshToken, User

pwd_context = CryptContext(schemes=["bcrypt_sha256"], deprecated="auto")
settings = get_settings()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "exp": expire, "jti": str(uuid.uuid4()), "typ": "access"}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_impersonation_token(subject: str, *, impersonated_by: int, minutes: int = 15) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    payload = {
        "sub": subject,
        "exp": expire,
        "jti": str(uuid.uuid4()),
        "impersonated_by": impersonated_by,
        "typ": "access",
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def _hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def issue_token_pair(
    db: AsyncSession,
    user: User,
    *,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> tuple[str, str]:
    """Returns (access_token, refresh_token_raw)."""
    access = create_access_token(str(user.id))
    jti = str(uuid.uuid4())
    raw = secrets.token_urlsafe(48)
    expires = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    db.add(
        RefreshToken(
            user_id=user.id,
            jti=jti,
            token_hash=_hash_refresh_token(raw),
            expires_at=expires,
            created_at=datetime.utcnow(),
            user_agent=(user_agent or "")[:512] or None,
            ip_address=(ip_address or "")[:64] or None,
        )
    )
    await db.flush()
    return access, raw


async def rotate_refresh_token(
    db: AsyncSession,
    raw_refresh: str,
    *,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> tuple[User, str, str]:
    """Validate refresh, revoke it, issue new pair. Returns (user, access, refresh)."""
    token_hash = _hash_refresh_token(raw_refresh)
    row = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if row is None or row.revoked_at is not None:
        raise ValueError("Invalid refresh token")
    if row.expires_at < datetime.utcnow():
        raise ValueError("Refresh token expired")
    user = await db.get(User, row.user_id)
    if user is None or user.deleted_at is not None:
        raise ValueError("User not found")
    row.revoked_at = datetime.utcnow()
    access, new_refresh = await issue_token_pair(
        db, user, user_agent=user_agent, ip_address=ip_address
    )
    return user, access, new_refresh


async def revoke_refresh_token(db: AsyncSession, raw_refresh: str | None) -> None:
    if not raw_refresh:
        return
    token_hash = _hash_refresh_token(raw_refresh)
    row = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if row and row.revoked_at is None:
        row.revoked_at = datetime.utcnow()
        await db.flush()


async def revoke_all_user_refresh_tokens(db: AsyncSession, user_id: int) -> None:
    rows = (
        await db.scalars(
            select(RefreshToken).where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked_at.is_(None),
            )
        )
    ).all()
    now = datetime.utcnow()
    for row in rows:
        row.revoked_at = now
    await db.flush()
