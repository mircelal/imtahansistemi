"""Wizard E2E: test admin ilə tam imtahan axını (10 sual, cavab kartı)."""
from __future__ import annotations

import json
import sys
import time

import httpx

from app.security import create_access_token

BASE = "http://localhost:8000"
USER_ID = "6"
TOKEN = create_access_token(USER_ID)
H = {"Authorization": f"Bearer {TOKEN}"}
Q_COUNT = 10


def req(method: str, path: str, **kw):
    with httpx.Client(base_url=BASE, timeout=120.0) as c:
        r = getattr(c, method)(path, headers=H, **kw)
    if r.status_code >= 400:
        print(f"FAIL {method.upper()} {path} -> {r.status_code}")
        try:
            print(json.dumps(r.json(), ensure_ascii=False, indent=2))
        except Exception:
            print(r.text[:2000])
        raise SystemExit(1)
    if r.headers.get("content-type", "").startswith("application/json"):
        return r.json()
    return r.content


def main():
    print("=== 1. Kurs + şagird (skan hazırlığı üçün) ===")
    course = req(
        "post",
        "/api/courses/",
        json={
            "name": f"Wizard Test Kurs {int(time.time())}",
            "description": "E2E test",
            "manager_id": int(USER_ID),
            "is_active": True,
        },
    )
    cid = course["id"]
    req(
        "post",
        f"/api/courses/{cid}/students",
        json={"student_number": "900001", "full_name": "Wizard Test Şagird"},
    )
    print(f"Kurs id={cid}")

    print("=== 2. İmtahan yarat (10 sual) ===")
    exam = req(
        "post",
        "/api/exams/",
        json={
            "course_id": cid,
            "title": f"Wizard UI Test {int(time.time())}",
            "description": "Tam axın testi",
            "question_count": Q_COUNT,
            "options_per_question": 4,
            "columns_count": 2,
            "negative_marking": False,
            "is_active": True,
            "grading_config": {
                "subjects": [{"code": "riyaz", "title": "Riyaziyyat"}],
                "question_blocks": [{"subject_code": "riyaz", "from_q": 1, "to_q": Q_COUNT}],
                "answer_card_identity": {
                    "student_code": True,
                    "school": True,
                    "class_num": True,
                    "first_name": True,
                    "last_name": True,
                    "father_name": False,
                    "phone": False,
                    "foreign_lang": False,
                    "group": False,
                    "variant": True,
                    "section": False,
                },
            },
            "grading_policy": {},
        },
    )
    eid = exam["id"]
    print(f"İmtahan id={eid}")

    print("=== 2. Suallar əlavə et ===")
    for i in range(1, Q_COUNT + 1):
        req(
            "post",
            f"/api/exams/{eid}/questions",
            json={
                "order_index": i,
                "qtype": "mcq",
                "stem": f"<p>Test sual {i}: 2+2=? (variant A)</p>",
                "points": 1,
            },
        )
    qs = req("get", f"/api/exams/{eid}/questions")
    print(f"Suallar: {len(qs)}")

    print("=== 3. Cavab açarı ===")
    keys = [
        {"question_number": i, "correct_answer": "A", "points": 1.0}
        for i in range(1, Q_COUNT + 1)
    ]
    req("post", f"/api/exams/{eid}/answer-key", json=keys)
    print("Cavab açarı saxlanıldı")

    print("=== 4. Cavab kartı PDF ===")
    gen = req(
        "post",
        "/api/answer-sheets/generate",
        json={
            "exam_id": eid,
            "template_config": {
                "question_count": Q_COUNT,
                "options_per_question": 4,
                "columns_count": 2,
                "paper_size": "A4",
                "title": "CAVAB KARTI",
                "header_subtitle": "",
            },
        },
    )
    sheet_uuid = gen.get("sheet_uuid")
    print(f"PDF sheet_uuid={sheet_uuid}")

    pdf_bytes = req("get", f"/api/answer-sheets/exam/{eid}/download-by-sheet/{sheet_uuid}")
    assert len(pdf_bytes) > 1000, f"PDF çox kiçik: {len(pdf_bytes)}"
    print(f"PDF ölçüsü: {len(pdf_bytes)} bayt")

    print("=== 5. Hazırlıq ===")
    readiness = req("get", f"/api/exams/{eid}/readiness")
    print(json.dumps(readiness, ensure_ascii=False, indent=2))
    if not readiness.get("ready_for_scan"):
        print("XƏTA: ready_for_scan false")
        raise SystemExit(1)

    print("\n=== UĞURLU ===")
    print(json.dumps({"exam_id": eid, "course_id": cid, "user_id": USER_ID}, indent=2))


if __name__ == "__main__":
    main()
