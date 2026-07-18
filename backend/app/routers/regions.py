"""Region / Area / Venue catalog for student marketplace."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_admin
from app.models.entities import Area, ExamVenue, Region, User
from app.schemas.common import ORMModel

router = APIRouter(tags=["regions"])


class RegionOut(ORMModel):
    id: int
    name: str
    slug: str
    sort_order: int
    is_active: bool
    latitude: float | None = None
    longitude: float | None = None


class AreaOut(ORMModel):
    id: int
    region_id: int
    name: str
    slug: str
    sort_order: int
    is_active: bool


class VenueOut(ORMModel):
    id: int
    area_id: int
    name: str
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    is_active: bool


class RegionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    slug: str = Field(min_length=1, max_length=64)
    sort_order: int = 0


class AreaCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    slug: str = Field(min_length=1, max_length=64)
    sort_order: int = 0


class VenueCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    address: str | None = Field(default=None, max_length=512)


@router.get("/api/regions", response_model=list[RegionOut])
async def list_regions(db: AsyncSession = Depends(get_db)):
    rows = (
        await db.scalars(
            select(Region).where(Region.is_active.is_(True)).order_by(Region.sort_order, Region.name)
        )
    ).all()
    return [RegionOut.model_validate(r) for r in rows]


@router.get("/api/regions/{region_id}/areas", response_model=list[AreaOut])
async def list_areas(region_id: int, db: AsyncSession = Depends(get_db)):
    region = await db.get(Region, region_id)
    if region is None or not region.is_active:
        raise HTTPException(status_code=404, detail="Bölgə tapılmadı")
    rows = (
        await db.scalars(
            select(Area)
            .where(Area.region_id == region_id, Area.is_active.is_(True))
            .order_by(Area.sort_order, Area.name)
        )
    ).all()
    return [AreaOut.model_validate(a) for a in rows]


@router.get("/api/areas/{area_id}/venues", response_model=list[VenueOut])
async def list_venues(area_id: int, db: AsyncSession = Depends(get_db)):
    area = await db.get(Area, area_id)
    if area is None or not area.is_active:
        raise HTTPException(status_code=404, detail="Ərazi tapılmadı")
    rows = (
        await db.scalars(
            select(ExamVenue)
            .where(ExamVenue.area_id == area_id, ExamVenue.is_active.is_(True))
            .order_by(ExamVenue.name)
        )
    ).all()
    return [VenueOut.model_validate(v) for v in rows]


@router.post("/api/admin/regions", response_model=RegionOut)
async def admin_create_region(
    payload: RegionCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    row = Region(
        name=payload.name.strip(),
        slug=payload.slug.strip().lower(),
        sort_order=payload.sort_order,
        is_active=True,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return RegionOut.model_validate(row)


@router.post("/api/admin/regions/{region_id}/areas", response_model=AreaOut)
async def admin_create_area(
    region_id: int,
    payload: AreaCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    region = await db.get(Region, region_id)
    if region is None:
        raise HTTPException(status_code=404, detail="Bölgə tapılmadı")
    row = Area(
        region_id=region_id,
        name=payload.name.strip(),
        slug=payload.slug.strip().lower(),
        sort_order=payload.sort_order,
        is_active=True,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return AreaOut.model_validate(row)


@router.post("/api/admin/areas/{area_id}/venues", response_model=VenueOut)
async def admin_create_venue(
    area_id: int,
    payload: VenueCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    area = await db.get(Area, area_id)
    if area is None:
        raise HTTPException(status_code=404, detail="Ərazi tapılmadı")
    row = ExamVenue(
        area_id=area_id,
        name=payload.name.strip(),
        address=payload.address,
        is_active=True,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return VenueOut.model_validate(row)
