"""İmtahan/kurs və sistem loqosunu cavab kartı və PDF sənədləri üçün yükləmə."""

from __future__ import annotations

from io import BytesIO

from reportlab.lib.utils import ImageReader
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.entities import Course, Exam, SystemSetting
from app.services.storage import StorageService

_settings = get_settings()

_KEY_LOGO_OBJECT = "logo_object_key"
_KEY_LOGO_CONTENT_TYPE = "logo_content_type"


async def load_header_logo_bytes_for_exam(db: AsyncSession, exam: Exam) -> tuple[bytes | None, str | None]:
    """Kurs loqosu (əvvəl), yoxdursa sistem loqosu."""
    storage = StorageService()
    if exam.course_id is not None:
        course = await db.get(Course, exam.course_id)
        if course and course.logo_object_key:
            try:
                raw = storage.get_bytes(_settings.minio_bucket_uploads, course.logo_object_key)
                return raw, course.logo_content_type or "image/png"
            except Exception:
                pass
    row = await db.get(SystemSetting, _KEY_LOGO_OBJECT)
    if not row or not (row.value or "").strip():
        return None, None
    try:
        raw = storage.get_bytes(_settings.minio_bucket_uploads, row.value.strip())
    except Exception:
        return None, None
    ct_row = await db.get(SystemSetting, _KEY_LOGO_CONTENT_TYPE)
    ct = (ct_row.value if ct_row else None) or "image/png"
    return raw, ct


def image_reader_from_bytes(raw: bytes | None) -> ImageReader | None:
    if not raw:
        return None
    try:
        return ImageReader(BytesIO(raw))
    except Exception:
        return None


async def load_header_logo_reader_for_exam(db: AsyncSession, exam: Exam) -> ImageReader | None:
    b, _ct = await load_header_logo_bytes_for_exam(db, exam)
    return image_reader_from_bytes(b)


async def load_logo_bytes_for_booklet(db: AsyncSession, exam: Exam) -> tuple[bytes | None, str | None]:
    """Sual kitabçası qapağı üçün eyni məntiq."""
    return await load_header_logo_bytes_for_exam(db, exam)
