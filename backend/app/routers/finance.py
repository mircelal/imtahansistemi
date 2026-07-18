from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_admin
from app.models.entities import User
from app.schemas.finance import AdminFinanceOverviewOut
from app.services.finance_overview import build_admin_finance_overview

router = APIRouter(prefix="/api/admin/finance", tags=["admin-finance"])


@router.get("/overview", response_model=AdminFinanceOverviewOut)
async def admin_finance_overview(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    """Bilik platforması — bütün kursların balansı və bilet gəlirləri."""
    return await build_admin_finance_overview(db)
