from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.deps import require_admin
from app.models.entities import SystemSetting, User
from app.schemas.settings import AdminSettingsOut, PublicSettingsOut, SettingsUpdate
from app.services.storage import StorageService

router = APIRouter(prefix="/api/settings", tags=["settings"])

KEY_SYSTEM_NAME = "system_name"
KEY_LOGO_OBJECT = "logo_object_key"
KEY_LOGO_CONTENT_TYPE = "logo_content_type"

DEFAULT_SYSTEM_NAME = "OMR imtahan sistemi"
MAX_LOGO_BYTES = 2 * 1024 * 1024
ALLOWED_LOGO_TYPES = {"image/png", "image/jpeg", "image/webp"}

_settings = get_settings()


async def _get_setting(db: AsyncSession, key: str) -> str | None:
    row = await db.get(SystemSetting, key)
    return row.value if row else None


async def _set_setting(db: AsyncSession, key: str, value: str) -> None:
    row = await db.get(SystemSetting, key)
    if row:
        row.value = value
    else:
        db.add(SystemSetting(key=key, value=value))


@router.get("/public", response_model=PublicSettingsOut)
async def public_settings(db: AsyncSession = Depends(get_db)):
    name = await _get_setting(db, KEY_SYSTEM_NAME) or DEFAULT_SYSTEM_NAME
    logo_key = await _get_setting(db, KEY_LOGO_OBJECT)
    return PublicSettingsOut(system_name=name, has_logo=bool(logo_key))


@router.get("/public/logo")
async def public_logo(db: AsyncSession = Depends(get_db)):
    logo_key = await _get_setting(db, KEY_LOGO_OBJECT)
    if not logo_key:
        raise HTTPException(status_code=404, detail="Logo yoxdur")
    ctype = await _get_setting(db, KEY_LOGO_CONTENT_TYPE) or "image/png"
    storage = StorageService()
    try:
        data = storage.get_bytes(_settings.minio_bucket_uploads, logo_key)
    except Exception:
        raise HTTPException(status_code=404, detail="Logo oxuna bilmədi")
    return Response(content=data, media_type=ctype)


@router.get("/admin", response_model=AdminSettingsOut)
async def admin_settings(_: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    name = await _get_setting(db, KEY_SYSTEM_NAME) or DEFAULT_SYSTEM_NAME
    logo_key = await _get_setting(db, KEY_LOGO_OBJECT)
    return AdminSettingsOut(system_name=name, has_logo=bool(logo_key))


@router.put("/admin", response_model=AdminSettingsOut)
async def admin_update_settings(
    payload: SettingsUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await _set_setting(db, KEY_SYSTEM_NAME, payload.system_name.strip())
    await db.commit()
    name = await _get_setting(db, KEY_SYSTEM_NAME) or DEFAULT_SYSTEM_NAME
    logo_key = await _get_setting(db, KEY_LOGO_OBJECT)
    return AdminSettingsOut(system_name=name, has_logo=bool(logo_key))


@router.post("/admin/logo")
async def admin_upload_logo(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
):
    if not file.content_type or file.content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(status_code=400, detail="Yalnız PNG, JPEG və ya WEBP qəbul edilir")
    raw = await file.read()
    if len(raw) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=400, detail="Logo çox böyükdür (max 2 MB)")
    ext = ".png"
    if file.content_type == "image/jpeg":
        ext = ".jpg"
    elif file.content_type == "image/webp":
        ext = ".webp"
    object_name = f"branding/logo-{uuid.uuid4().hex}{ext}"
    storage = StorageService()
    storage.upload_bytes(_settings.minio_bucket_uploads, object_name, raw, file.content_type)
    await _set_setting(db, KEY_LOGO_OBJECT, object_name)
    await _set_setting(db, KEY_LOGO_CONTENT_TYPE, file.content_type)
    await db.commit()
    return {"ok": True, "message": "Logo yeniləndi"}


@router.delete("/admin/logo")
async def admin_delete_logo(_: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    await _set_setting(db, KEY_LOGO_OBJECT, "")
    await _set_setting(db, KEY_LOGO_CONTENT_TYPE, "")
    await db.commit()
    return {"ok": True, "message": "Logo silindi"}
