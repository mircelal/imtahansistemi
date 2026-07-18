from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.entities import User, UserRole
from app.schemas.dashboard import PlatformDashboardOut
from app.services.platform_dashboard import build_platform_dashboard

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/overview", response_model=PlatformDashboardOut)
async def dashboard_overview(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """İdarə paneli — KPI, xəbərdarlıqlar, son aktivlik, imtahan axını."""
    if user.role == UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Şagird kabinetindən istifadə edin")
    return await build_platform_dashboard(db, user)
