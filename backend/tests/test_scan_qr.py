"""scan_qr servisi — QR meta və fayl axtarışı."""

from app.services.scan_qr import detect_exam_id_from_uploads, qr_meta_from_service_response


def test_qr_meta_from_omr_service_response():
    raw = {
        "qr_raw": "omr:v1:abc-sheet-uuid:42",
        "exam_id_from_qr": 42,
        "sheet_uuid": "abc-sheet-uuid",
    }
    meta = qr_meta_from_service_response(raw)
    assert meta["exam_id"] == 42
    assert meta["sheet_uuid"] == "abc-sheet-uuid"
    assert meta["qr_raw"] == "omr:v1:abc-sheet-uuid:42"
    assert meta["format"] == "omr:v1"


def test_qr_meta_parses_raw_when_service_omits_exam_id():
    raw = {"qr_raw": "omr:v1:sheet-99:7"}
    meta = qr_meta_from_service_response(raw)
    assert meta["exam_id"] == 7
    assert meta["sheet_uuid"] == "sheet-99"


def test_detect_exam_id_returns_none_without_images(monkeypatch):
    monkeypatch.setattr(
        "app.services.scan_qr.read_qr_from_image_bytes",
        lambda _b: {},
    )
    assert detect_exam_id_from_uploads([]) is None
