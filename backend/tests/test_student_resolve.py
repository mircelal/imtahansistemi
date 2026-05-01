from __future__ import annotations

from types import SimpleNamespace

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.models.entities import Base, Course, Student, User, UserRole
from app.services.student_resolve import (
    extract_student_code_from_detected,
    merge_student_identity_into_config,
    resolve_student_id_from_scan,
    template_expects_student_code,
)


def test_extract_student_code():
    tc = {
        "identity_fields": [
            {"kind": "digit_groups", "groups": [{"id": "student_code", "label": "Kod", "count": 6}]}
        ]
    }
    det = {f"id_student_code{i}": str(i % 10) for i in range(1, 7)}
    assert extract_student_code_from_detected(det, tc) == "123456"


def test_merge_student_identity_prepends_six_digit_group():
    cfg = merge_student_identity_into_config({"identity_section": True})
    assert any(
        g.get("id") == "student_code"
        for f in cfg.get("identity_fields", [])
        if f.get("kind") == "digit_groups"
        for g in f.get("groups") or []
    )


def test_resolve_student_id_from_scan_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(
            User(
                id=1,
                email="t@example.com",
                password_hash="x",
                full_name="Mgr",
                role=UserRole.ADMIN,
            )
        )
        db.add(Course(id=1, name="C", description=None, manager_id=1, is_active=True))
        db.add(Student(course_id=1, student_number="654321", full_name="Test"))
        db.commit()
        exam = SimpleNamespace(course_id=1)
        tc = {
            "identity_fields": [
                {"kind": "digit_groups", "groups": [{"id": "student_code", "label": "Kod", "count": 6}]}
            ]
        }
        det = {f"id_student_code{i}": str((7 - i) % 10) for i in range(1, 7)}
        sid, reason = resolve_student_id_from_scan(db, exam, det, tc)
        assert reason is None
        row = db.scalar(select(Student).where(Student.student_number == "654321"))
        assert row is not None
        assert sid == row.id


def test_template_expects_student_code():
    assert template_expects_student_code(
        {"identity_fields": [{"kind": "digit_groups", "groups": [{"id": "student_code", "count": 6}]}]}
    )
    assert not template_expects_student_code({"identity_fields": []})
