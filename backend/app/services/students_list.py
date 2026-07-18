from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Course, ResultStatus, ScanResult, ScanSession, Student, User
from app.schemas.courses import StudentListPageOut, StudentListRowOut, StudentsSummaryOut
from app.services.student_profile import percent_for_result


@dataclass
class StudentListParams:
    course_id: int | None = None
    course_ids: list[int] | None = None
    search: str | None = None
    has_login: bool | None = None
    sort: str = "full_name"
    order: str = "asc"
    limit: int = 50
    offset: int = 0


def _stats_subq():
    return (
        select(
            ScanResult.student_id.label("student_id"),
            func.count(func.distinct(ScanSession.exam_id)).label("exam_count"),
            func.max(ScanResult.processed_at).label("last_graded_at"),
        )
        .join(ScanSession, ScanResult.session_id == ScanSession.id)
        .group_by(ScanResult.student_id)
    ).subquery()


def _latest_result_subq():
    ranked = (
        select(
            ScanResult.student_id.label("student_id"),
            ScanResult.score.label("score"),
            ScanResult.max_score.label("max_score"),
            ScanResult.status.label("status"),
            func.row_number()
            .over(partition_by=ScanResult.student_id, order_by=ScanResult.processed_at.desc())
            .label("rn"),
        )
    ).subquery()
    return select(ranked).where(ranked.c.rn == 1).subquery()


def _student_filters(params: StudentListParams):
    clauses = []
    if params.course_id is not None:
        clauses.append(Student.course_id == params.course_id)
    elif params.course_ids is not None:
        if not params.course_ids:
            clauses.append(False)
        else:
            clauses.append(Student.course_id.in_(params.course_ids))

    if params.search:
        term = f"%{params.search.strip()}%"
        clauses.append(
            or_(
                Student.full_name.ilike(term),
                Student.student_number.ilike(term),
                User.email.ilike(term),
                User.fin_code.ilike(term),
            )
        )

    if params.has_login is True:
        clauses.append(User.id.isnot(None))
    elif params.has_login is False:
        clauses.append(User.id.is_(None))

    return clauses


async def query_students_page(db: AsyncSession, params: StudentListParams) -> StudentListPageOut:
    stats = _stats_subq()
    latest = _latest_result_subq()
    filters = _student_filters(params)

    count_q = (
        select(func.count(func.distinct(Student.id)))
        .select_from(Student)
        .outerjoin(User, User.linked_student_id == Student.id)
        .where(*filters)
    )
    total = int(await db.scalar(count_q) or 0)

    q = (
        select(
            Student,
            User.id.label("login_user_id"),
            User.email.label("login_email"),
            User.fin_code.label("fin_code"),
            stats.c.exam_count,
            stats.c.last_graded_at,
            latest.c.score.label("last_score"),
            latest.c.max_score.label("last_max_score"),
            latest.c.status.label("last_status"),
            Course.name.label("course_name"),
        )
        .outerjoin(User, User.linked_student_id == Student.id)
        .outerjoin(stats, stats.c.student_id == Student.id)
        .outerjoin(latest, latest.c.student_id == Student.id)
        .outerjoin(Course, Course.id == Student.course_id)
        .where(*filters)
    )

    sort_desc = params.order.lower() == "desc"
    if params.sort == "student_number":
        q = q.order_by(desc(Student.student_number) if sort_desc else asc(Student.student_number), Student.id)
    elif params.sort == "created_at":
        q = q.order_by(desc(Student.created_at) if sort_desc else asc(Student.created_at), Student.id)
    elif params.sort == "last_result_at":
        q = q.order_by(
            desc(stats.c.last_graded_at.nullslast()) if sort_desc else asc(stats.c.last_graded_at.nullsfirst()),
            Student.id,
        )
    else:
        q = q.order_by(desc(Student.full_name) if sort_desc else asc(Student.full_name), Student.id)

    q = q.limit(params.limit).offset(params.offset)
    rows = (await db.execute(q)).all()

    items: list[StudentListRowOut] = []
    for (
        st,
        login_uid,
        login_email,
        fin_code,
        exam_count,
        last_graded,
        last_score,
        last_max,
        last_status,
        course_name,
    ) in rows:
        last_pct = None
        if last_score is not None and last_max is not None and last_status != ResultStatus.ERROR:
            fake = ScanResult(
                session_id=0,
                image_path="",
                score=last_score,
                max_score=last_max,
                status=last_status,
            )
            last_pct = percent_for_result(fake)

        items.append(
            StudentListRowOut(
                id=st.id,
                course_id=st.course_id,
                course_name=course_name or ("Kurs təyin olunmayıb" if st.course_id is None else "—"),
                student_number=st.student_number,
                full_name=st.full_name,
                created_at=st.created_at,
                login_user_id=login_uid,
                login_email=login_email,
                fin_code=fin_code,
                has_login=login_uid is not None,
                exam_count=int(exam_count or 0),
                last_percent=last_pct,
                last_graded_at=last_graded,
            )
        )

    return StudentListPageOut(items=items, total=total)


async def query_students_summary(
    db: AsyncSession,
    *,
    course_id: int | None = None,
    course_ids: list[int] | None = None,
) -> StudentsSummaryOut:
    st_q = select(Student.id, User.id.label("login_id")).outerjoin(
        User, User.linked_student_id == Student.id
    )
    if course_id is not None:
        st_q = st_q.where(Student.course_id == course_id)
    elif course_ids is not None:
        if not course_ids:
            return StudentsSummaryOut()
        st_q = st_q.where(Student.course_id.in_(course_ids))

    rows = (await db.execute(st_q)).all()
    total = len(rows)
    with_cabinet = sum(1 for _, lid in rows if lid is not None)
    student_ids = [r[0] for r in rows]

    with_results = 0
    total_exam_slots = 0
    if student_ids:
        stats_rows = (
            await db.execute(
                select(
                    ScanResult.student_id,
                    func.count(func.distinct(ScanSession.exam_id)),
                )
                .join(ScanSession, ScanResult.session_id == ScanSession.id)
                .where(ScanResult.student_id.in_(student_ids))
                .group_by(ScanResult.student_id)
            )
        ).all()
        with_results = len(stats_rows)
        total_exam_slots = sum(int(c or 0) for _, c in stats_rows)

    avg_exams = round(total_exam_slots / with_results, 2) if with_results else None

    return StudentsSummaryOut(
        total=total,
        with_cabinet=with_cabinet,
        without_cabinet=total - with_cabinet,
        with_results=with_results,
        avg_exams_per_student=avg_exams,
    )
