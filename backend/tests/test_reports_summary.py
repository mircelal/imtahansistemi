"""Reports /summary — multi-column SQL nəticəsinin düzgün oxunması."""

from unittest.mock import AsyncMock, MagicMock

from app.routers.reports import _build_summary


def test_build_summary_unpacks_score_and_student_id():
    """db.execute multi-column select; scalars() yalnız birinci sütunu qaytarır (500 səbəbi)."""
    db = AsyncMock()

    session_ids_result = MagicMock()
    session_ids_result.all.return_value = [10]

    execute_result = MagicMock()
    execute_result.all.return_value = [
        (85.0, 1),
        (70.0, 2),
        (90.0, 1),
    ]

    db.scalars = AsyncMock(return_value=session_ids_result)
    db.execute = AsyncMock(return_value=execute_result)

    import asyncio

    out = asyncio.run(_build_summary(db, 9))

    assert out["scan_rows"] == 3
    assert out["unique_students"] == 2
    assert abs(out["average"] - 81.666) < 0.1
    assert len(out["histogram"]) >= 1
