from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "omr_worker",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.worker.scan_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Uzun OMR task-ları — ehtiyatda çox iş toplamamaq
    worker_prefetch_multiplier=1,
)
