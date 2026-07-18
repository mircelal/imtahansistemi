"""E2E test: kurs, şagird, imtahan, cavab kartı."""
from __future__ import annotations

import json
import sys
import time
import traceback

import httpx

from app.security import create_access_token

BASE = "http://localhost:8000"
TOKEN = create_access_token("1")
H = {"Authorization": f"Bearer {TOKEN}"}


def dim_standard_template_cfg(q_count: int = 30) -> dict:
    x = 19.0
    y_top = 16.85 + 10.0
    col_pitch = max(3.05 + 0.12, 3.35)
    name_h = 5.0 + 6.0 + 32 * 3.0 + 5.0
    y_digits = y_top + name_h + 3.0
    y_meta = y_digits + 22.0
    fields = [
        {"kind": "vertical_letters", "id": "ad", "label": "ADINIZ", "columns": 7,
         "col_pitch_mm": col_pitch, "x_mm": x, "y_mm": y_top},
        {"kind": "vertical_letters", "id": "sn", "label": "SOYADINIZ", "columns": 8,
         "col_pitch_mm": col_pitch, "x_mm": x + 30.0, "y_mm": y_top},
        {"kind": "vertical_letters", "id": "fn", "label": "ATA ADI", "columns": 6,
         "col_pitch_mm": col_pitch, "x_mm": x + 63.0, "y_mm": y_top},
        {"kind": "digits", "id": "student_code", "label": "Şagird kodu", "count": 6,
         "x_mm": x, "y_mm": y_digits},
        {"kind": "digits", "id": "sch", "label": "Məktəb №", "count": 3,
         "x_mm": x + 38.0, "y_mm": y_digits},
        {"kind": "digits", "id": "cl", "label": "Sinif", "count": 2,
         "x_mm": x + 58.0, "y_mm": y_digits},
        {"kind": "mcq", "id": "grp", "label": "Qrup", "options": ["1", "2", "3", "4", "5"],
         "x_mm": x, "y_mm": y_meta},
        {"kind": "mcq", "id": "var", "label": "Variant", "options": ["A", "B"],
         "x_mm": x + 42.0, "y_mm": y_meta},
        {"kind": "mcq", "id": "sec", "label": "Bölmə", "options": ["Az", "RU", "GÜ"],
         "x_mm": x + 72.0, "y_mm": y_meta},
    ]
    return {
        "layout_mode": "freeform",
        "identity_section": True,
        "identity_fields": fields,
        "identity_digit_compact": True,
        "paper_size": "A4",
        "title": "CAVAB KARTI",
        "question_count": q_count,
        "options_per_question": 5,
        "columns_count": 2,
        "single_page_layout": True,
        "mcq_grid": {"top_mm": y_meta + 18.0, "left_mm": x},
    }


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
    print("=== 1. Kurs yarat ===")
    course = req("post", "/api/courses/", json={
        "name": f"Test Kurs E2E {int(time.time())}",
        "description": "Avtomatik test",
        "manager_id": 1,
        "is_active": True,
    })
    cid = course["id"]
    print(f"Kurs id={cid}")

    print("=== 2. Şagirdlər ===")
    for num, name in [("100001", "Test Şagird Bir"), ("100002", "Test Şagird Iki")]:
        req("post", f"/api/courses/{cid}/students", json={"student_number": num, "full_name": name})
    students_page = req("get", f"/api/courses/{cid}/students?limit=10")
    print(f"Şagird sayı: {students_page['total']}")

    print("=== 3. Kabinet ===")
    st1 = students_page["items"][0]
    email = f"test.e2e.{int(time.time())}@example.com"
    login = req("post", f"/api/courses/{cid}/students/{st1['id']}/login", json={
        "email": email,
        "password": "test1234",
        "full_name": st1["full_name"],
    })
    print(f"Kabinet yaradıldı: {login.get('email', email)}")

    print("=== 4. İmtahan ===")
    exam = req("post", "/api/exams/", json={
        "course_id": cid,
        "title": "Test İmtahan E2E",
        "description": "30 sual test",
        "question_count": 30,
        "options_per_question": 5,
        "columns_count": 1,
        "negative_marking": False,
        "is_active": True,
        "grading_config": {},
        "grading_policy": {},
    })
    eid = exam["id"]
    print(f"İmtahan id={eid}")

    print("=== 5. Cavab açarı ===")
    letters = "ABCDE"
    keys = [
        {"question_number": i, "correct_answer": letters[(i - 1) % 5], "points": 1.0}
        for i in range(1, 31)
    ]
    req("post", f"/api/exams/{eid}/answer-key", json=keys)
    print("30 cavab açarı yazıldı")

    print("=== 6. Cavab kartı PDF ===")
    template = dim_standard_template_cfg(30)
    gen = req("post", "/api/answer-sheets/generate", json={
        "exam_id": eid,
        "template_config": template,
    })
    print(f"PDF sheet_uuid={gen.get('sheet_uuid')} path={gen.get('pdf_path')}")

    print("=== 6b. PDF endir ===")
    pdf_bytes = req("get", gen["download_url"])
    assert len(pdf_bytes) > 1000, f"PDF çox kiçik: {len(pdf_bytes)}"
    print(f"PDF ölçüsü: {len(pdf_bytes)} bayt")

    print("=== 6c. Layout audit ===")
    audit = req("post", "/api/answer-sheets/audit", json={
        "exam_id": eid,
        "template_config": template,
    })
    warnings = audit.get("layout_warnings") or []
    publish_issues = audit.get("publish_blocking_issues") or []
    print(f"Audit: {len(warnings)} xəbərdarlıq, publish blok={len(publish_issues)}")
    if publish_issues:
        print(json.dumps(publish_issues, ensure_ascii=False, indent=2))
        raise SystemExit(1)

    print("=== 7. Preview PNG ===")
    preview = req("post", "/api/answer-sheets/preview", json={
        "exam_id": eid,
        "template_config": template,
    })
    print(f"Preview keys: {list(preview.keys()) if isinstance(preview, dict) else len(preview)}")

    print("=== 8. Summary / readiness ===")
    summary = req("get", f"/api/reports/exams/{eid}/summary")
    print(f"Report participation={summary.get('participation')}")

    integrations = req("get", f"/api/exams/{eid}/integrations")
    print(f"Integrations: templates={integrations.get('answer_sheet_templates_count')}")

    print("\n=== UĞURLU ===")
    print(json.dumps({"course_id": cid, "exam_id": eid}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        traceback.print_exc()
        sys.exit(1)
