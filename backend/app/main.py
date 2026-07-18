from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import get_settings
from app.limiter import limiter
from app.middleware.request_logger import RequestLoggerMiddleware
from app.routers import (
    admin_ticket_orders,
    answer_sheet_presets,
    answer_sheets,
    auth,
    courses,
    dashboard,
    exam_scoring_profiles,
    exam_types,
    exams,
    finance,
    payments,
    question_bank,
    questions,
    regions,
    reports,
    scans,
    scoring_formula_presets,
    settings as settings_router,
    student_marketplace,
    student_portal,
    students_admin,
    tickets,
    users,
)

cfg = get_settings()

app = FastAPI(title=cfg.project_name)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(RequestLoggerMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(student_portal.router)
app.include_router(student_marketplace.router)
app.include_router(regions.router)
app.include_router(settings_router.router)
app.include_router(users.router)
app.include_router(courses.router)
app.include_router(dashboard.router)
app.include_router(questions.router)
app.include_router(question_bank.router)
app.include_router(exams.router)
app.include_router(exam_scoring_profiles.router)
app.include_router(exam_types.router)
app.include_router(scoring_formula_presets.router)
app.include_router(answer_sheet_presets.router)
app.include_router(answer_sheets.router)
app.include_router(scans.router)
app.include_router(reports.router)
app.include_router(tickets.router)
app.include_router(tickets.public_router)
app.include_router(admin_ticket_orders.router)
app.include_router(finance.router)
app.include_router(payments.router)
app.include_router(students_admin.router)


@app.get("/health")
@limiter.limit("120/minute")
async def health(request: Request):
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}
