from __future__ import annotations

from io import BytesIO
from statistics import mean, pstdev

import openpyxl
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ensure_exam_access, ensure_course_access, get_current_user
from app.models.entities import AnswerKey, Exam, ResultStatus, ScanResult, ScanSession, Student, User
from app.schemas.reports import ReportExamDetailOut, ReportOverviewOut
from app.services.report_analytics import build_exam_report_detail, build_reports_overview

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/overview", response_model=ReportOverviewOut)
async def reports_overview(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Bütün əlçatan imtahanların xülasəsi — səhifə açılanda boş qalmır."""
    return await build_reports_overview(db, user)


@router.get("/exams/{exam_id}/detail", response_model=ReportExamDetailOut)
async def exam_report_detail(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Seçilmiş imtahan üçün tam analitika paneli."""
    exam = await ensure_exam_access(exam_id, user, db)
    return await build_exam_report_detail(db, exam)


async def _build_summary(db: AsyncSession, exam_id: int) -> dict:
    sessions = (await db.scalars(select(ScanSession.id).where(ScanSession.exam_id == exam_id))).all()
    if not sessions:
        return {
            "average": 0,
            "minimum": 0,
            "maximum": 0,
            "std_dev": 0,
            "participation": 0,
            "unique_students": 0,
            "scan_rows": 0,
            "histogram": [],
        }
    rows = (
        await db.execute(
            select(ScanResult.score, ScanResult.student_id).where(ScanResult.session_id.in_(sessions))
        )
    ).all()
    values = [float(v) for v, _ in rows if v is not None]
    unique_students = len({sid for _, sid in rows if sid is not None})
    scan_rows = len(rows)
    if not values:
        return {
            "average": 0,
            "minimum": 0,
            "maximum": 0,
            "std_dev": 0,
            "participation": 0,
            "unique_students": 0,
            "scan_rows": 0,
            "histogram": [],
        }
    return {
        "average": mean(values),
        "minimum": min(values),
        "maximum": max(values),
        "std_dev": pstdev(values) if len(values) > 1 else 0,
        "participation": unique_students,
        "unique_students": unique_students,
        "scan_rows": scan_rows,
        "histogram": _score_histogram(values),
    }


async def _build_item_analysis(db: AsyncSession, exam_id: int) -> dict:
    keys = (
        await db.scalars(select(AnswerKey).where(AnswerKey.exam_id == exam_id).order_by(AnswerKey.question_number))
    ).all()
    sessions = (await db.scalars(select(ScanSession.id).where(ScanSession.exam_id == exam_id))).all()
    results: list[ScanResult] = []
    if sessions:
        results = (
            await db.scalars(select(ScanResult).where(ScanResult.session_id.in_(sessions)).order_by(ScanResult.id))
        ).all()
    items = []
    for k in keys:
        correct = 0
        attempted = 0
        for r in results:
            if r.status == ResultStatus.ERROR:
                continue
            ans = str(r.detected_answers.get(f"Q{k.question_number}", "") or "").strip().upper()
            ca = (k.correct_answer or "").strip().upper()
            if ans:
                attempted += 1
            if ans and ans == ca:
                correct += 1
        p = (correct / attempted) if attempted else 0.0
        items.append(
            {
                "question_number": k.question_number,
                "correct_count": correct,
                "attempted_count": attempted,
                "difficulty_p": round(p, 4),
                "correct_answer": k.correct_answer,
            }
        )
    return {"exam_id": exam_id, "items": items}


def _score_histogram(values: list[float], bins: int = 10) -> list[dict]:
    if not values:
        return []
    mn, mx = min(values), max(values)
    if mx == mn:
        return [{"from": mn, "to": mx, "count": len(values)}]
    step = (mx - mn) / bins
    out = [{"from": round(mn + i * step, 4), "to": round(mn + (i + 1) * step, 4), "count": 0} for i in range(bins)]
    for v in values:
        i = min(bins - 1, int((v - mn) / step)) if step > 0 else 0
        out[i]["count"] += 1
    return out


@router.get("/exams/{exam_id}/summary")
async def exam_summary(
    exam_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    await ensure_exam_access(exam_id, user, db)
    return await _build_summary(db, exam_id)


@router.get("/exams/{exam_id}/item-analysis")
async def item_analysis(
    exam_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    await ensure_exam_access(exam_id, user, db)
    return await _build_item_analysis(db, exam_id)


@router.get("/students/{student_id}/history")
async def student_history(
    student_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    student = await db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    await ensure_course_access(student.course_id, user, db)
    stmt = (
        select(ScanResult, ScanSession)
        .join(ScanSession, ScanResult.session_id == ScanSession.id)
        .where(ScanResult.student_id == student_id)
        .order_by(ScanResult.processed_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    history = [
        {
            "scan_result_id": r.id,
            "exam_id": s.exam_id,
            "session_id": s.id,
            "score": r.score,
            "max_score": r.max_score,
            "score_breakdown": r.score_breakdown,
            "status": r.status.value,
            "processed_at": r.processed_at.isoformat() if r.processed_at else None,
        }
        for r, s in rows
    ]
    return {"student_id": student_id, "history": history}


@router.get("/exams/{exam_id}/export/excel")
async def export_excel(
    exam_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    await ensure_exam_access(exam_id, user, db)
    exam = await db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    sessions = (await db.scalars(select(ScanSession.id).where(ScanSession.exam_id == exam_id))).all()
    results: list[ScanResult] = []
    if sessions:
        results = (
            await db.scalars(select(ScanResult).where(ScanResult.session_id.in_(sessions)).order_by(ScanResult.id))
        ).all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Nəticələr"
    headers = ["id", "session_id", "image_path", "score", "max_score", "status"] + [
        f"Q{i}" for i in range(1, exam.question_count + 1)
    ]
    ws.append(headers)
    for r in results:
        row = [
            r.id,
            r.session_id,
            r.image_path,
            r.score,
            r.max_score,
            r.status.value,
        ]
        for i in range(1, exam.question_count + 1):
            row.append(r.detected_answers.get(f"Q{i}", "") if r.detected_answers else "")
        ws.append(row)

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"imtahan-{exam_id}-neticeler.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/exams/{exam_id}/export/pdf")
async def export_pdf(
    exam_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    await ensure_exam_access(exam_id, user, db)
    exam = await db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")

    summary = await _build_summary(db, exam_id)
    items = await _build_item_analysis(db, exam_id)

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    y = height - 40
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, y, f"İmtahan hesabatı: {exam.title}")
    y -= 28
    c.setFont("Helvetica", 10)
    c.drawString(40, y, f"İştirak: {summary.get('participation', 0)} | Orta: {summary.get('average', 0):.2f}")
    y -= 16
    c.drawString(
        40,
        y,
        f"Min: {summary.get('minimum', 0):.2f} | Max: {summary.get('maximum', 0):.2f} | Std: {summary.get('std_dev', 0):.2f}",
    )
    y -= 28
    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, y, "Sual analizi (ilk 25)")
    y -= 16
    c.setFont("Helvetica", 8)
    for it in items["items"][:25]:
        if y < 60:
            c.showPage()
            y = height - 40
            c.setFont("Helvetica", 8)
        line = f"Sual {it['question_number']}: düzgün {it['correct_count']}/{it['attempted_count']}  p={it['difficulty_p']}"
        c.drawString(40, y, line)
        y -= 12
    c.save()
    buffer.seek(0)
    filename = f"imtahan-{exam_id}-hesabat.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
