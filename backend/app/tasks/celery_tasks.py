from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "backend_tasks",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)


@celery_app.task(bind=True, max_retries=3)
def ping_task(self):
    return {"status": "ok"}
