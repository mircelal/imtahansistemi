from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.models.entities import Student, StudentDevice, User, UserRole
from app.schemas.common import MessageResponse
from app.schemas.student_portal import (
    StudentDeviceRegister,
    StudentExamDetailOut,
    StudentProfileOut,
    StudentProfileUpdate,
)
from app.services.storage import StorageService
from app.services.student_profile import build_student_exam_detail, build_student_profile

router = APIRouter(prefix="/api/me/student", tags=["student-portal"])
_settings = get_settings()
_storage = StorageService()


async def _require_linked_student(user: User, db: AsyncSession) -> Student:
    if user.role != UserRole.STUDENT or user.linked_student_id is None:
        raise HTTPException(status_code=403, detail="Bu məlumat yalnız şagird hesabları üçündür")
    student = await db.get(Student, user.linked_student_id)
    if student is None:
        raise HTTPException(
            status_code=404,
            detail="Şagird qeydiyyatı tapılmadı — administrator ilə əlaqə saxlayın",
        )
    return student


@router.get("", response_model=StudentProfileOut)
async def my_student_profile(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    student = await _require_linked_student(user, db)
    return await build_student_profile(db, student, account_user=user)


@router.patch("", response_model=StudentProfileOut)
async def update_my_student_profile(
    payload: StudentProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    student = await _require_linked_student(user, db)
    if payload.full_name is not None:
        name = payload.full_name.strip()
        user.full_name = name
        student.full_name = name
    if payload.phone is not None:
        user.phone = payload.phone.strip() or None
    if payload.preferred_region_id is not None:
        user.preferred_region_id = payload.preferred_region_id
    if payload.preferred_area_id is not None:
        user.preferred_area_id = payload.preferred_area_id
    if payload.bio is not None:
        user.bio = payload.bio.strip() or None
    if payload.school_name is not None:
        user.school_name = payload.school_name.strip() or None
    if payload.grade_label is not None:
        user.grade_label = payload.grade_label.strip() or None
    await db.commit()
    await db.refresh(user)
    await db.refresh(student)
    return await build_student_profile(db, student, account_user=user)


@router.post("/avatar", response_model=MessageResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_linked_student(user, db)
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Şəkil maksimum 5MB ola bilər")
    ct = (file.content_type or "image/jpeg").lower()
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="Yalnız şəkil faylı qəbul olunur")
    ext = Path(file.filename or "avatar.jpg").suffix.lower() or ".jpg"
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        ext = ".jpg"
    object_name = f"avatars/student-{user.id}-{uuid.uuid4().hex}{ext}"
    _storage.upload_bytes(_settings.minio_bucket_uploads, object_name, raw, ct)
    user.avatar_object_key = object_name
    await db.commit()
    return MessageResponse(message="Profil şəkli yeniləndi")


@router.get("/avatar")
async def get_avatar(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _require_linked_student(user, db)
    key = user.avatar_object_key
    if not key:
        raise HTTPException(status_code=404, detail="Avatar yoxdur")
    try:
        data = _storage.get_bytes(_settings.minio_bucket_uploads, key)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Avatar tapılmadı") from exc
    ct = "image/jpeg"
    if key.endswith(".png"):
        ct = "image/png"
    elif key.endswith(".webp"):
        ct = "image/webp"
    return Response(content=data, media_type=ct)


@router.post("/devices", response_model=MessageResponse)
async def register_device(
    payload: StudentDeviceRegister,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_linked_student(user, db)
    platform = payload.platform.strip().lower()
    if platform not in {"ios", "android", "web"}:
        raise HTTPException(status_code=400, detail="platform: ios | android | web")
    existing = await db.scalar(
        select(StudentDevice).where(
            StudentDevice.user_id == user.id,
            StudentDevice.push_token == payload.push_token,
        )
    )
    now = datetime.utcnow()
    if existing:
        existing.platform = platform
        existing.app_version = payload.app_version
        existing.is_active = True
        existing.updated_at = now
    else:
        db.add(
            StudentDevice(
                user_id=user.id,
                platform=platform,
                push_token=payload.push_token,
                app_version=payload.app_version,
                is_active=True,
                created_at=now,
                updated_at=now,
            )
        )
    await db.commit()
    return MessageResponse(message="Cihaz qeydə alındı")


@router.get("/exams/{exam_id}", response_model=StudentExamDetailOut)
async def my_student_exam_detail(
    exam_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    student = await _require_linked_student(user, db)
    detail = await build_student_exam_detail(db, student, exam_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Bu imtahan üzrə nəticə tapılmadı")
    return detail
