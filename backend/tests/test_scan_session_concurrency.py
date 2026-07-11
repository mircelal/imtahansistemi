"""Skan sessiyası: kilid, QR şablon qoruyucusu, manual düzəliş bərpası."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.worker import scan_session_lock
from app.worker.scan_tasks import (
    _correction_restore_key,
    _reapply_session_corrections,
    _resolve_image_template_config,
    _snapshot_session_corrections,
    process_scan_session,
)


def test_acquire_lock_blocks_second_caller():
    scan_session_lock._redis_client.cache_clear()
    fake = MagicMock()
    stored: dict[str, str] = {}

    def _set(key, val, nx=False, ex=None):
        if nx and key in stored:
            return None
        stored[key] = val
        return True

    def _get(key):
        return stored.get(key)

    fake.set.side_effect = _set
    fake.get.side_effect = _get

    def _delete(key):
        stored.pop(key, None)

    fake.delete.side_effect = _delete
    with patch.object(scan_session_lock, "_redis_client", return_value=fake):
        t1 = scan_session_lock.acquire_scan_session_lock(99)
        t2 = scan_session_lock.acquire_scan_session_lock(99)
        assert t1 is not None
        assert t2 is None
        scan_session_lock.release_scan_session_lock(99, t1)
        assert scan_session_lock.scan_lock_key(99) not in stored


def test_process_session_returns_early_when_locked():
    with patch("app.worker.scan_tasks.acquire_scan_session_lock", return_value=None):
        with patch("app.worker.scan_tasks.mark_scan_session_reprocess_pending") as mark:
            out = process_scan_session.run(42)
    assert out.get("error") == "session already processing"
    assert out.get("session_id") == 42
    assert out.get("requeue") is True
    mark.assert_called_once_with(42)


def test_correction_restore_key_uses_sheet_and_student():
    key = _correction_restore_key({"__sheet_uuid__": "abc", "id_student_code1": "1"}, None)
    assert key == "abc|code:1"
    key2 = _correction_restore_key({"__sheet_uuid__": "abc"}, 55)
    assert key2 == "abc|sid:55"


def test_resolve_template_config_no_qr_uses_fallback_when_available():
    db = MagicMock()
    with patch("app.worker.scan_tasks._read_qr_from_omr_service", return_value={}):
        cfg, err = _resolve_image_template_config(db, 1, b"img", {"single_page_layout": True})
    assert err is None
    assert cfg == {"single_page_layout": True}


def test_resolve_template_config_no_qr_without_fallback_returns_error():
    db = MagicMock()
    with patch("app.worker.scan_tasks._read_qr_from_omr_service", return_value={}):
        cfg, err = _resolve_image_template_config(db, 1, b"img", {})
    assert err == "QR oxunmadı — təsdiqlənmiş cavab kartı tapılmadı"
    assert cfg == {}


def test_resolve_template_config_unknown_sheet_uuid():
    db = MagicMock()
    db.scalar.return_value = None
    with patch(
        "app.worker.scan_tasks._read_qr_from_omr_service",
        return_value={"sheet_uuid": "UNKNOWN-UUID", "exam_id_from_qr": 1},
    ):
        cfg, err = _resolve_image_template_config(db, 1, b"img", {"x": 1})
    assert err is not None
    assert "Naməlum vərəq" in err
    assert "UNKNOWN-UUID" in err


def test_snapshot_session_corrections_by_stable_key():
    db = MagicMock()
    row = SimpleNamespace(
        id=10,
        image_path="scans/1/files/a.jpg",
        detected_answers={"__sheet_uuid__": "SU-1", "id_student_code1": "9"},
        student_id=None,
    )
    corr = SimpleNamespace(
        id=1,
        scan_result_id=10,
        corrected_answers={"Q1": "B"},
        corrected_by=5,
    )

    def _scalars_side_effect(stmt):
        mock_result = MagicMock()
        if "manual_corrections" in str(stmt):
            mock_result.all.return_value = [corr]
        else:
            mock_result.all.return_value = [row]
        return mock_result

    db.scalars.side_effect = _scalars_side_effect
    snap = _snapshot_session_corrections(db, 1)
    assert "SU-1|code:9" in snap
    assert snap["SU-1|code:9"][0]["corrected_answers"] == {"Q1": "B"}
    assert snap["SU-1|code:9"][0]["corrected_by"] == 5


def test_reapply_corrections_restores_manual_rows():
    snapshot = {
        "img-uuid|sid:55": [
            {"corrected_answers": {"Q1": "C"}, "corrected_by": 7},
        ]
    }
    session = SimpleNamespace(exam_id=2)
    exam = SimpleNamespace(id=2, question_count=1, options_per_question=4, columns_count=1)
    result_row = SimpleNamespace(
        id=100,
        image_path="other/path.jpg",
        detected_answers={"Q1": "A", "__sheet_uuid__": "img-uuid"},
        score=0.0,
        max_score=1.0,
        score_breakdown=None,
        student_id=55,
        status="ok",
        error_message=None,
    )
    mock_db = MagicMock()
    mock_db.get.side_effect = lambda model, pk: session if pk == 1 else exam

    call_idx = {"n": 0}

    def _scalars_side_effect(stmt):
        mock_result = MagicMock()
        call_idx["n"] += 1
        if call_idx["n"] == 1:
            mock_result.all.return_value = []
        else:
            mock_result.all.return_value = [result_row]
        return mock_result

    mock_db.scalars.side_effect = _scalars_side_effect
    mock_db.scalar.return_value = None

    with patch("app.worker.scan_tasks.SyncSessionLocal") as sess_local:
        sess_local.return_value.__enter__.return_value = mock_db
        with patch("app.worker.scan_tasks.score_exam", return_value=(1.0, 1.0, {"per_question": {}})):
            with patch("app.worker.scan_tasks.resolve_student_id_from_scan", return_value=(55, None)):
                _reapply_session_corrections(1, snapshot)

    assert mock_db.add.called
    added = mock_db.add.call_args[0][0]
    assert added.corrected_answers == {"Q1": "C"}
    assert added.corrected_by == 7
    mock_db.commit.assert_called_once()
