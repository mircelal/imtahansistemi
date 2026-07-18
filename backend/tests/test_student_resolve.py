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


def test_merge_student_identity_merges_into_existing_digit_groups():
    """Ayrıca blok yaratmadan — ilk digit_groups-a student_code əlavə olunur."""
    cfg = merge_student_identity_into_config(
        {
            "identity_section": True,
            "identity_fields": [
                {
                    "kind": "digit_groups",
                    "x_mm": 19.0,
                    "y_mm": 80.0,
                    "groups": [{"id": "sch", "label": "Məktəb", "count": 3}],
                },
                {"kind": "vertical_letters", "id": "ad", "label": "AD", "columns": 4},
            ],
        }
    )
    fields = cfg.get("identity_fields") or []
    assert len(fields) == 2
    dg = fields[0]
    assert dg.get("kind") == "digit_groups"
    gids = [str(g.get("id")) for g in dg.get("groups") or []]
    assert gids[0] == "student_code"
    assert "sch" in gids


def test_merge_standalone_student_block_has_mm_positions():
    cfg = merge_student_identity_into_config({"identity_section": True})
    first = (cfg.get("identity_fields") or [])[0]
    assert first.get("x_mm") is not None
    assert first.get("y_mm") is not None


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


def test_merge_does_not_duplicate_when_digits_student_code_present():
    """DİM şablonu: ayrıca `digits` student_code varsa merge əlavə blok yaratmamalıdır."""
    fields = [
        {"kind": "vertical_letters", "id": "ad", "label": "ADINIZ", "columns": 7, "x_mm": 19.0, "y_mm": 26.5},
        {"kind": "digits", "id": "student_code", "label": "Şagird kodu", "count": 6, "x_mm": 19.0, "y_mm": 124.0},
        {"kind": "digits", "id": "sch", "label": "Məktəb №", "count": 3, "x_mm": 57.0, "y_mm": 124.0},
    ]
    cfg = merge_student_identity_into_config({"identity_section": True, "identity_fields": fields})
    assert len(cfg.get("identity_fields") or []) == 3
    assert not any(f.get("kind") == "digit_groups" for f in cfg.get("identity_fields") or [])


def test_extract_student_code_from_digits_field():
    tc = {
        "identity_fields": [
            {"kind": "digits", "id": "student_code", "label": "Şagird kodu", "count": 6},
        ]
    }
    det = {f"id_student_code{i}": str(i % 10) for i in range(1, 7)}
    assert extract_student_code_from_detected(det, tc) == "123456"
    assert template_expects_student_code(tc)


def test_template_expects_student_code():
    assert template_expects_student_code(
        {"identity_fields": [{"kind": "digit_groups", "groups": [{"id": "student_code", "count": 6}]}]}
    )
    assert not template_expects_student_code({"identity_fields": []})
