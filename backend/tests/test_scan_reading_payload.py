"""Kanonik skan oxunuşu (OMR JSON) — vahid struktur və QR parse."""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

from app.services.scan_reading_payload import (
    READING_VERSION,
    build_identity_key_labels,
    build_scan_reading_dict,
    compose_card_identity,
    parse_omr_qr_payload,
    split_detected_answers,
)


def test_compose_card_identity_from_omr_fields():
    raw = {
        "id_ad01": "B",
        "id_ad02": "A",
        "id_ad03": "Ş",
        "id_sn01": "A",
        "id_sn02": "B",
        "id_sn03": "A",
        "id_fn01": "A",
        "id_fn02": "U",
        "id_fn03": "A",
        "id_student_code1": "1",
        "id_student_code2": "3",
        "id_student_code3": "2",
        "id_student_code4": "2",
        "id_student_code5": "1",
        "id_student_code6": "4",
        "id_sch1": "2",
        "id_sch2": "1",
        "id_sch3": "1",
        "id_cl1": "1",
        "id_cl2": "0",
        "id_var": "D",
        "id_lang": "Fr",
        "q1": "B",
    }
    card = compose_card_identity(raw)
    assert card["student_code"] == "132214"
    assert card["first_name"] == "BAŞ"
    assert card["last_name"] == "ABA"
    assert card["father_name"] == "AUA"
    assert card["full_name"] == "BAŞ ABA AUA"
    assert card["school"] == "211"
    assert card["class"] == "10"
    assert card["variant"] == "D"
    assert card["language"] == "Fr"
    assert "q1" not in card


def test_parse_omr_qr_v1_and_extras():
    r = parse_omr_qr_payload("omr:v1:sheet-uuid-9:7:ticket:ABC-12")
    assert r["format"] == "omr:v1"
    assert r["sheet_uuid"] == "sheet-uuid-9"
    assert r["exam_id"] == 7
    assert r["extras"] == ["ticket", "ABC-12"]
    assert r["ticket"] == "ABC-12"


def test_split_detected_answers():
    raw = {
        "__sheet_uuid__": "u1",
        "__qr_raw__": "omr:v1:u1:5",
        "id_d1": "3",
        "Q1": "A",
        "q2": "B",
        "noise": "x",
    }
    meta, identity, mcq = split_detected_answers(raw)
    assert meta["__sheet_uuid__"] == "u1"
    assert meta["__qr_raw__"] == "omr:v1:u1:5"
    assert meta["noise"] == "x"
    assert identity == {"id_d1": "3"}
    assert mcq == {"Q1": "A", "Q2": "B"}


def test_build_identity_key_labels_digit_groups():
    cfg = {
        "identity_fields": [
            {
                "kind": "digit_groups",
                "groups": [{"id": "d", "label": "Fin", "count": 2}],
            }
        ]
    }
    labels = build_identity_key_labels(cfg)
    assert labels["id_d1"] == "Fin — rəqəm 1"
    assert labels["id_d2"] == "Fin — rəqəm 2"


def test_build_scan_reading_dict_shape():
    result = SimpleNamespace(
        id=10,
        detected_answers={
            "__sheet_uuid__": "abc",
            "__qr_raw__": "omr:v1:abc:99:ticket:T1",
            "id_x1": "1",
            "q1": "C",
        },
        score=1.5,
        max_score=10.0,
        status="ok",
        error_message=None,
        image_path="scans/1/a.jpg",
        processed_at=datetime(2026, 5, 1, 12, 0, 0),
    )
    session = SimpleNamespace(id=2)
    exam = SimpleNamespace(id=99, title="Demo")
    tc = {"omr_two_page_stitched": True, "single_page_layout": False}
    d = build_scan_reading_dict(result=result, session=session, exam=exam, template_config=tc, qr_raw_hint=None)
    assert d["version"] == READING_VERSION
    assert d["scan_result_id"] == 10
    assert d["session_id"] == 2
    assert d["exam_id"] == 99
    assert d["sheet_uuid"] == "abc"
    assert d["qr"]["ticket"] == "T1"
    assert d["identity"] == {"id_x1": "1"}
    assert d["mcq"] == {"Q1": "C"}
    assert d["template_hints"]["omr_two_page_stitched"] is True
    assert d["template_hints"]["single_page_layout"] is False
    assert "id_x1" in d["field_labels"]
    assert d["raw_detected"]["q1"] == "C"
