"""Student marketplace — exam catalog."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.entities import (
    Area,
    Exam,
    ExamTicket,
    ExamVenue,
    Region,
    User,
    UserRole,
)
from app.services.exam_lifecycle import exam_lifecycle_status
from app.services.ticket_helpers import enrich_ticket

router = APIRouter(prefix="/api/student", tags=["student-marketplace"])


class CatalogTicketOut(BaseModel):
    id: int
    title: str
    price_amount: float
    currency: str
    remaining_quota: int | None = None
    sale_status: str
    course_id: int
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class StudentExamListItem(BaseModel):
    id: int
    title: str
    description: str | None = None
    scheduled_at: datetime | None = None
    ends_at: datetime | None = None
    lifecycle_status: str
    delivery_mode: str
    city: str | None = None
    venue: str | None = None
    region_id: int | None = None
    region_name: str | None = None
    area_id: int | None = None
    area_name: str | None = None
    venue_id: int | None = None
    venue_name: str | None = None
    list_price_amount: float
    list_price_currency: str
    exam_category: str
    min_ticket_price: float | None = None
    tickets_available: int = 0
    latitude: float | None = None
    longitude: float | None = None
    distance_km: float | None = None


def _coords_for_exam(exam: Exam, reg: Region | None, venue: ExamVenue | None) -> tuple[float | None, float | None]:
    if venue and venue.latitude is not None and venue.longitude is not None:
        return float(venue.latitude), float(venue.longitude)
    if reg and reg.latitude is not None and reg.longitude is not None:
        return float(reg.latitude), float(reg.longitude)
    return None, None


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    from math import asin, cos, radians, sin, sqrt

    r = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(a))


class StudentExamDetail(StudentExamListItem):
    tickets: list[CatalogTicketOut] = Field(default_factory=list)
    seat_quota: int | None = None
    resale_enabled: bool = False


async def _require_student(user: User) -> User:
    if user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Yalnız şagirdlər üçün")
    return user


async def _active_tickets_for_exam(db: AsyncSession, exam_id: int) -> list[ExamTicket]:
    now = datetime.utcnow()
    rows = (
        await db.scalars(
            select(ExamTicket).where(
                ExamTicket.exam_id == exam_id,
                ExamTicket.is_active.is_(True),
                or_(ExamTicket.starts_at.is_(None), ExamTicket.starts_at <= now),
                or_(ExamTicket.ends_at.is_(None), ExamTicket.ends_at >= now),
            )
        )
    ).all()
    return list(rows)


@router.get("/exams", response_model=list[StudentExamListItem])
async def list_student_exams(
    region_id: int | None = Query(default=None),
    area_id: int | None = Query(default=None),
    from_dt: datetime | None = Query(default=None, alias="from"),
    to_dt: datetime | None = Query(default=None, alias="to"),
    near_lat: float | None = Query(default=None, ge=-90, le=90),
    near_lng: float | None = Query(default=None, ge=-180, le=180),
    radius_km: float | None = Query(default=None, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_student(user)
    now = datetime.utcnow()
    q = select(Exam).where(
        Exam.course_id.is_(None),
        Exam.is_active.is_(True),
    )
    if region_id is not None:
        q = q.where(Exam.region_id == region_id)
    if area_id is not None:
        q = q.where(Exam.area_id == area_id)
    if from_dt is not None:
        q = q.where(or_(Exam.scheduled_at.is_(None), Exam.scheduled_at >= from_dt))
    if to_dt is not None:
        q = q.where(or_(Exam.scheduled_at.is_(None), Exam.scheduled_at <= to_dt))
    exams = (await db.scalars(q.order_by(Exam.scheduled_at.nulls_last(), Exam.id.desc()))).all()

    region_ids = {e.region_id for e in exams if e.region_id}
    area_ids = {e.area_id for e in exams if e.area_id}
    venue_ids = {e.venue_id for e in exams if e.venue_id}
    regions = {
        r.id: r
        for r in (
            await db.scalars(select(Region).where(Region.id.in_(region_ids)))
        ).all()
    } if region_ids else {}
    areas = {
        a.id: a
        for a in (await db.scalars(select(Area).where(Area.id.in_(area_ids)))).all()
    } if area_ids else {}
    venues = {
        v.id: v
        for v in (await db.scalars(select(ExamVenue).where(ExamVenue.id.in_(venue_ids)))).all()
    } if venue_ids else {}

    out: list[StudentExamListItem] = []
    for exam in exams:
        life = exam_lifecycle_status(exam, now=now)
        if life not in ("scheduled", "live"):
            continue
        tickets = await _active_tickets_for_exam(db, exam.id)
        if not tickets and not (exam.resale_enabled or exam.list_price_amount > 0):
            continue
        prices = [float(t.price_amount) for t in tickets] if tickets else None
        reg = regions.get(exam.region_id) if exam.region_id else None
        area = areas.get(exam.area_id) if exam.area_id else None
        venue = venues.get(exam.venue_id) if exam.venue_id else None
        lat, lng = _coords_for_exam(exam, reg, venue)
        dist = None
        if near_lat is not None and near_lng is not None and lat is not None and lng is not None:
            dist = round(_haversine_km(near_lat, near_lng, lat, lng), 1)
            if radius_km is not None and dist > radius_km:
                continue
        out.append(
            StudentExamListItem(
                id=exam.id,
                title=exam.title,
                description=exam.description,
                scheduled_at=exam.scheduled_at,
                ends_at=exam.ends_at,
                lifecycle_status=life,
                delivery_mode=exam.delivery_mode,
                city=exam.city,
                venue=exam.venue,
                region_id=exam.region_id,
                region_name=reg.name if reg else None,
                area_id=exam.area_id,
                area_name=area.name if area else None,
                venue_id=exam.venue_id,
                venue_name=venue.name if venue else None,
                list_price_amount=float(exam.list_price_amount or 0),
                list_price_currency=exam.list_price_currency or "AZN",
                exam_category=exam.exam_category,
                min_ticket_price=min(prices) if prices else (
                    float(exam.list_price_amount) if exam.list_price_amount else None
                ),
                tickets_available=len(tickets),
                latitude=lat,
                longitude=lng,
                distance_km=dist,
            )
        )
    if near_lat is not None and near_lng is not None:
        out.sort(key=lambda x: x.distance_km if x.distance_km is not None else 1e9)
    return out


@router.get("/exams/{exam_id}", response_model=StudentExamDetail)
async def get_student_exam(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_student(user)
    exam = await db.get(Exam, exam_id)
    if exam is None or exam.course_id is not None or not exam.is_active:
        raise HTTPException(status_code=404, detail="İmtahan tapılmadı")
    now = datetime.utcnow()
    life = exam_lifecycle_status(exam, now=now)
    tickets = await _active_tickets_for_exam(db, exam.id)
    ticket_outs: list[CatalogTicketOut] = []
    for t in tickets:
        enriched = await enrich_ticket(db, t)
        ticket_outs.append(
            CatalogTicketOut(
                id=t.id,
                title=t.title,
                price_amount=float(t.price_amount),
                currency=t.currency or "AZN",
                remaining_quota=getattr(enriched, "remaining_quota", None),
                sale_status=getattr(enriched, "sale_status", "active"),
                course_id=t.course_id,
                starts_at=t.starts_at,
                ends_at=t.ends_at,
            )
        )
    reg = await db.get(Region, exam.region_id) if exam.region_id else None
    area = await db.get(Area, exam.area_id) if exam.area_id else None
    venue = await db.get(ExamVenue, exam.venue_id) if exam.venue_id else None
    prices = [float(t.price_amount) for t in tickets]
    lat, lng = _coords_for_exam(exam, reg, venue)
    return StudentExamDetail(
        id=exam.id,
        title=exam.title,
        description=exam.description,
        scheduled_at=exam.scheduled_at,
        ends_at=exam.ends_at,
        lifecycle_status=life,
        delivery_mode=exam.delivery_mode,
        city=exam.city,
        venue=exam.venue,
        region_id=exam.region_id,
        region_name=reg.name if reg else None,
        area_id=exam.area_id,
        area_name=area.name if area else None,
        venue_id=exam.venue_id,
        venue_name=venue.name if venue else None,
        list_price_amount=float(exam.list_price_amount or 0),
        list_price_currency=exam.list_price_currency or "AZN",
        exam_category=exam.exam_category,
        min_ticket_price=min(prices) if prices else None,
        tickets_available=len(tickets),
        tickets=ticket_outs,
        seat_quota=exam.seat_quota,
        resale_enabled=bool(exam.resale_enabled),
        latitude=lat,
        longitude=lng,
    )
