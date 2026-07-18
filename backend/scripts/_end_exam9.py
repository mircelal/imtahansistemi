from datetime import datetime, timedelta

from app.database_sync import SyncSessionLocal
from app.models.entities import Exam
from app.services.exam_lifecycle import exam_lifecycle_status, is_exam_ended

db = SyncSessionLocal()
try:
    e = db.get(Exam, 9)
    if e is None:
        raise SystemExit("exam 9 not found")
    print("title", e.title)
    print("before", e.scheduled_at, e.ends_at)
    now = datetime.utcnow()
    e.scheduled_at = now - timedelta(hours=4)
    e.ends_at = now - timedelta(minutes=2)
    db.commit()
    db.refresh(e)
    print("after", e.scheduled_at, e.ends_at)
    print("lifecycle", exam_lifecycle_status(e), "locked", is_exam_ended(e))
finally:
    db.close()
