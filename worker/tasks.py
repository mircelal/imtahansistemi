import os
from io import BytesIO
from zipfile import ZipFile

import httpx
from celery import Celery

celery_app = Celery(
    "worker_tasks",
    broker=os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/1"),
)


@celery_app.task(bind=True, max_retries=3)
def process_scan_session(self, session_id: int):
    return {"session_id": session_id, "status": "processing-placeholder"}


@celery_app.task(bind=True, max_retries=3)
def process_single_image(self, session_id: int, image_path: str):
    return {"session_id": session_id, "image_path": image_path, "status": "ok"}


@celery_app.task(bind=True, max_retries=3)
def generate_exam_report(self, exam_id: int, format: str):
    return {"exam_id": exam_id, "format": format, "path": f"reports/exam-{exam_id}.{format}"}
