from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.entities import Course, CourseOperator, Exam, ScanSession, User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
settings = get_settings()


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise credentials_exception
    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise credentials_exception
    return user


def require_roles(*roles: UserRole):
    allowed = set(roles)

    async def _checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return user

    return _checker


require_admin = require_roles(UserRole.ADMIN)


async def get_course_or_404(course_id: int, db: AsyncSession) -> Course:
    course = await db.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course


async def _course_operator_link(course_id: int, user_id: int, db: AsyncSession) -> bool:
    lid = await db.scalar(
        select(CourseOperator.course_id).where(
            CourseOperator.course_id == course_id,
            CourseOperator.operator_user_id == user_id,
        )
    )
    return lid is not None


async def ensure_course_access(course_id: int, user: User, db: AsyncSession) -> Course:
    course = await get_course_or_404(course_id, db)
    if user.role == UserRole.ADMIN:
        return course
    if user.role == UserRole.MANAGER and course.manager_id == user.id:
        return course
    if user.role == UserRole.OPERATOR and await _course_operator_link(course_id, user.id, db):
        return course
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


async def ensure_course_write(course_id: int, user: User, db: AsyncSession) -> Course:
    course = await get_course_or_404(course_id, db)
    if user.role == UserRole.ADMIN:
        return course
    if user.role == UserRole.MANAGER and course.manager_id == user.id:
        return course
    if user.role == UserRole.OPERATOR and await _course_operator_link(course_id, user.id, db):
        return course
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


async def ensure_course_manager_or_admin(course_id: int, user: User, db: AsyncSession) -> Course:
    """Operator təyin etmək / silmək — yalnız kurs meneceri və ya administrator."""
    course = await get_course_or_404(course_id, db)
    if user.role == UserRole.ADMIN:
        return course
    if user.role == UserRole.MANAGER and course.manager_id == user.id:
        return course
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Yalnız kurs meneceri və ya administrator")


async def get_exam_or_404(exam_id: int, db: AsyncSession) -> Exam:
    exam = await db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    return exam


async def ensure_exam_access(exam_id: int, user: User, db: AsyncSession) -> Exam:
    exam = await get_exam_or_404(exam_id, db)
    if exam.course_id is None:
        if user.role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ümumi imtahan — yalnız administrator")
        return exam
    await ensure_course_access(exam.course_id, user, db)
    return exam


async def ensure_exam_write(exam_id: int, user: User, db: AsyncSession) -> Exam:
    exam = await get_exam_or_404(exam_id, db)
    if exam.course_id is None:
        if user.role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ümumi imtahan — yalnız administrator")
        return exam
    await ensure_course_write(exam.course_id, user, db)
    return exam


async def get_scan_session_or_404(session_id: int, db: AsyncSession) -> ScanSession:
    session = await db.get(ScanSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


async def ensure_scan_session_access(session_id: int, user: User, db: AsyncSession) -> ScanSession:
    session = await get_scan_session_or_404(session_id, db)
    exam = await get_exam_or_404(session.exam_id, db)
    if exam.course_id is None:
        if user.role == UserRole.ADMIN:
            return session
        if user.role == UserRole.OPERATOR and session.operator_id == user.id:
            return session
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    course = await get_course_or_404(exam.course_id, db)
    if user.role == UserRole.ADMIN:
        return session
    if user.role == UserRole.MANAGER and course.manager_id == user.id:
        return session
    if user.role == UserRole.OPERATOR:
        if session.operator_id == user.id:
            return session
        if await _course_operator_link(course.id, user.id, db):
            return session
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
