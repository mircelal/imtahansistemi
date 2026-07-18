import json
import re
import uuid
import zipfile
from datetime import datetime
from io import BytesIO
from typing import Any

import httpx
from sqlalchemy import delete, func, select

from app.celery_worker import celery_app
from app.config import get_settings
from app.database_sync import SyncSessionLocal
from app.models.entities import (
    AnswerKey,
    AnswerSheetTemplate,
    EssayGrade,
    Exam,
    ManualCorrection,
    Question,
    ResultStatus,
    ScanResult,
    ScanSession,
    SessionStatus,
)
from app.services.a3_fold_imposition import is_a3_duplex_fold, split_scan_face_to_panels
from app.services.essay_crop import crop_essay_regions_for_scan
from app.services.open_question_layout import compose_grid_in_from_detected
from app.services.pdf_generator import get_omr_template
from app.services.scan_reading_payload import compose_card_identity
from app.services.scan_scoring import (
    essay_question_numbers_from_questions,
    merge_corrected_mcqs,
    question_types_from_questions,
    score_exam,
)
from app.services.student_resolve import (
    resolve_student_id_from_scan,
    template_expects_student_code,
)
from app.services.storage import StorageService
from app.worker.scan_session_lock import (
    acquire_scan_session_lock,
    clear_session_finalize_claim,
    decr_session_sheet_pending,
    extend_scan_session_lock,
    force_acquire_scan_session_lock,
    is_scan_session_locked,
    mark_scan_session_reprocess_pending,
    pop_scan_session_reprocess_pending,
    pop_session_correction_snapshot,
    pop_session_essay_snapshot,
    recover_stale_session_pending,
    release_scan_session_lock,
    set_session_sheet_pending,
    store_session_correction_snapshot,
    store_session_essay_snapshot,
    try_claim_session_finalize,
)

settings = get_settings()

QR_FALLBACK_NOTICE = (
    "QR oxunmadı — emal son təsdiqlənmiş cavab kartı şablonu ilə davam etdi "
    "(nəticə saxlanılıb; mümkün olsa aşağı sağ küncdə QR görünən tam səhifə skan yükləyin)."
)

MAX_ZIP_MEMBERS = 500
MAX_ZIP_UNCOMPRESSED_BYTES = 500 * 1024 * 1024
MAX_ZIP_COMPRESSION_RATIO = 100

_IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif")

_omr_http_client: httpx.Client | None = None


def _omr_http() -> httpx.Client:
    """Keep-alive HTTP client — hər vərəqdə yeni TCP açmamaq üçün."""
    global _omr_http_client
    if _omr_http_client is None:
        _omr_http_client = httpx.Client(
            timeout=httpx.Timeout(120.0, connect=10.0),
            limits=httpx.Limits(max_connections=64, max_keepalive_connections=32),
        )
    return _omr_http_client


def _normalize_image_bytes_for_omr(image_bytes: bytes) -> bytes:
    """Telefon şəkilləri (WebP, PNG, HEIC/HEIF, …) OMR üçün JPEG-ə çevirir."""
    from io import BytesIO

    from PIL import Image, UnidentifiedImageError

    try:
        import pillow_heif  # type: ignore[import-untyped]

        pillow_heif.register_heif_opener()
    except ImportError:
        pass

    try:
        im = Image.open(BytesIO(image_bytes))
    except (UnidentifiedImageError, OSError):
        return image_bytes
    try:
        if im.mode in ("RGBA", "P"):
            im = im.convert("RGB")
        elif im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        if im.mode == "L":
            im = im.convert("RGB")
        out = BytesIO()
        im.save(out, format="JPEG", quality=92)
        return out.getvalue()
    except Exception:  # noqa: BLE001
        return image_bytes


def _call_omr(
    image_bytes: bytes,
    template: dict[str, Any],
    *,
    skip_qr: bool = False,
    sheet_uuid_hint: str | None = None,
    exam_id_hint: int | None = None,
) -> dict[str, Any]:
    """
    OMR servisinə şəkli göndər.
    template — tam OMRChecker template (get_omr_template() vasitəsilə hazırlanmış).
    skip_qr: worker artıq QR oxuyubsa OMR içində təkrar skanı keç.
    """
    files = {"file": ("scan.jpg", image_bytes, "image/jpeg")}
    data: dict[str, str] = {"template_config": json.dumps(template)}
    if skip_qr:
        data["skip_qr"] = "1"
    if sheet_uuid_hint:
        data["sheet_uuid_hint"] = str(sheet_uuid_hint)
    if exam_id_hint is not None:
        data["exam_id_hint"] = str(int(exam_id_hint))
    r = _omr_http().post(f"{settings.omr_service_url}/process", files=files, data=data)
    r.raise_for_status()
    return r.json()


def _read_qr_from_omr_service(image_bytes: bytes) -> dict[str, Any]:
    try:
        r = _omr_http().post(
            f"{settings.omr_service_url}/qr",
            files={"file": ("scan.jpg", image_bytes, "image/jpeg")},
            timeout=30.0,
        )
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def _invalidate_stale_omr_template_cfg(cfg: dict[str, Any]) -> dict[str, Any]:
    """Yalnız açıq stale flag olduqda saxlanmış OMR şablonunu sil (HTTP endpoint ilə eyni)."""
    if cfg.get("_omr_template_stale"):
        cfg.pop("omr_template", None)
        cfg.pop("_omr_template_stale", None)
    return cfg


def _natural_sort_key(name: str) -> list[Any]:
    parts = re.split(r"(\d+)", name.replace("\\", "/"))
    out: list[Any] = []
    for p in parts:
        if p.isdigit():
            out.append(int(p))
        elif p:
            out.append(p.lower())
    return out


def _stitch_group_base(name: str) -> str:
    lower = name.lower().replace("\\", "/")
    for token in (
        "page1",
        "page_1",
        "page-1",
        "p1",
        "səhifə1",
        "sheet1",
        "page2",
        "page_2",
        "page-2",
        "p2",
        "səhifə2",
        "sheet2",
    ):
        lower = lower.replace(token, "")
    return re.sub(r"[_\-.]+", "_", lower).strip("_")


def _pair_collected_for_stitch(
    collected: list[tuple[str, bytes]],
) -> list[tuple[str, bytes, str | None, bytes | None]]:
    """Səhifə ipucları + natural sort ilə 2-səhifəli cütlər."""
    by_group: dict[str, dict[int, tuple[str, bytes]]] = {}
    unhinted: list[tuple[str, bytes]] = []
    for name, data in collected:
        hint = _page_hint_from_filename(name)
        if hint in (1, 2):
            base = _stitch_group_base(name)
            by_group.setdefault(base, {})[hint] = (name, data)
        else:
            unhinted.append((name, data))

    pairs: list[tuple[str, bytes, str | None, bytes | None]] = []
    for base in sorted(by_group.keys(), key=_natural_sort_key):
        pages = by_group[base]
        if 1 in pages and 2 in pages:
            t1, b1 = pages[1]
            t2, b2 = pages[2]
            pairs.append((t1, b1, t2, b2))
        elif 1 in pages:
            t, b = pages[1]
            pairs.append((t, b, None, None))
        elif 2 in pages:
            t, b = pages[2]
            pairs.append((t, b, None, None))

    unhinted.sort(key=lambda x: _natural_sort_key(x[0]))
    i = 0
    while i < len(unhinted):
        if i + 1 < len(unhinted):
            n1, b1 = unhinted[i]
            n2, b2 = unhinted[i + 1]
            pairs.append((n1, b1, n2, b2))
            i += 2
        else:
            n, b = unhinted[i]
            pairs.append((n, b, None, None))
            i += 1
    return pairs


def _pair_collected_for_a3_fold(
    collected: list[tuple[str, bytes]],
) -> list[tuple[str, bytes, str | None, bytes | None]]:
    """
    A3 duplex: üz1 + üz2 cütləri.
    Hint: face1/face2 və ya page1/page2. Hintsiz ardıcıl cütləşmə.
    Qaytarır: (face1_name, face1_bytes, face2_name|None, face2_bytes|None)
    """
    by_group: dict[str, dict[int, tuple[str, bytes]]] = {}
    unhinted: list[tuple[str, bytes]] = []
    for name, data in collected:
        hint = _face_hint_from_filename(name)
        if hint in (1, 2):
            base = _stitch_group_base(name)
            by_group.setdefault(base, {})[hint] = (name, data)
        else:
            unhinted.append((name, data))

    pairs: list[tuple[str, bytes, str | None, bytes | None]] = []
    for base in sorted(by_group.keys(), key=_natural_sort_key):
        faces = by_group[base]
        if 1 in faces and 2 in faces:
            n1, b1 = faces[1]
            n2, b2 = faces[2]
            pairs.append((n1, b1, n2, b2))
        elif 1 in faces:
            n, b = faces[1]
            pairs.append((n, b, None, None))
        elif 2 in faces:
            n, b = faces[2]
            pairs.append((n, b, None, None))

    unhinted.sort(key=lambda x: _natural_sort_key(x[0]))
    i = 0
    while i < len(unhinted):
        if i + 1 < len(unhinted):
            n1, b1 = unhinted[i]
            n2, b2 = unhinted[i + 1]
            pairs.append((n1, b1, n2, b2))
            i += 2
        else:
            n, b = unhinted[i]
            pairs.append((n, b, None, None))
            i += 1
    return pairs


def _correction_restore_key(detected: dict[str, Any] | None, student_id: int | None) -> str:
    """Manual düzəliş bərpası — image_path deyil, sheet_uuid + şagird."""
    det = detected or {}
    su = str(det.get("__sheet_uuid__") or "").strip()
    if student_id is not None and su:
        return f"{su}|sid:{int(student_id)}"
    digits: list[str] = []
    for i in range(1, 7):
        v = det.get(f"id_student_code{i}")
        if v is not None and str(v).strip():
            digits.append(str(v).strip())
    code = "".join(digits)
    if su and code:
        return f"{su}|code:{code}"
    if su:
        return f"{su}|anon"
    return ""


def _save_stitched_image(storage: StorageService, bucket: str, session_id: int, merged: bytes) -> str:
    key = f"scans/{session_id}/stitched/{uuid.uuid4().hex}.jpg"
    storage.upload_bytes(bucket, key, merged, "image/jpeg")
    return key


def _page_hint_from_filename(name: str) -> int | None:
    lower = name.lower().replace("\\", "/")
    p2 = ("page2", "page_2", "p2", "səhifə2", "sheet2", "_2.", "-2.", "_2_", "-2-")
    p1 = ("page1", "page_1", "p1", "səhifə1", "sheet1", "_1.", "-1.", "_1_", "-1-")
    if any(t in lower for t in p2):
        return 2
    if any(t in lower for t in p1):
        return 1
    return None


def _scan_image_allowed_for_template(name: str, cfg: dict[str, Any]) -> bool:
    """İki səhifə + stitched deyil: yalnız MCQ (2-ci) səhifə şəkilləri."""
    if cfg.get("single_page_layout") is not False:
        return True
    if bool(cfg.get("omr_two_page_stitched")):
        return True
    hint = _page_hint_from_filename(name)
    if hint == 1:
        return False
    return True


def _stitch_images_vertical(top: bytes, bottom: bytes) -> bytes:
    from PIL import Image

    im1 = Image.open(BytesIO(top)).convert("RGB")
    im2 = Image.open(BytesIO(bottom)).convert("RGB")
    w = max(im1.width, im2.width)
    h = im1.height + im2.height
    out = Image.new("RGB", (w, h), (255, 255, 255))
    out.paste(im1, (0, 0))
    out.paste(im2, (0, im1.height))
    buf = BytesIO()
    out.save(buf, format="JPEG", quality=92)
    return buf.getvalue()


def _face_hint_from_filename(name: str) -> int | None:
    """A3 duplex: üz 1 (ön) / üz 2 (arxa)."""
    lower = name.lower().replace("\\", "/")
    f2 = ("face2", "face_2", "side2", "back", "arxa", "uz2", "üz2", "_f2.", "-f2.")
    f1 = ("face1", "face_1", "side1", "front", "on", "ön", "uz1", "üz1", "_f1.", "-f1.")
    if any(t in lower for t in f2):
        return 2
    if any(t in lower for t in f1):
        return 1
    # page2 → üz 2 kimi qəbul (A3 fold cütü)
    ph = _page_hint_from_filename(name)
    return ph


def _crop_panel_jpeg(image_bytes: bytes, box: tuple[int, int, int, int]) -> bytes:
    from PIL import Image

    im = Image.open(BytesIO(image_bytes)).convert("RGB")
    crop = im.crop(box)
    buf = BytesIO()
    crop.save(buf, format="JPEG", quality=92)
    return buf.getvalue()


def _run_a3_fold_face_omr(
    image_bytes: bytes,
    omr_tmpl: dict[str, Any],
    *,
    face: int,
    sheet_uuid_hint: str | None,
    exam_id_hint: int,
) -> tuple[dict[str, Any], float, str]:
    """
    A3 üz şəklini 2 panelə bölüb panel şablonları ilə OMR edir.
    Qaytarır: (merged_answers, min_confidence, detail)
    """
    from PIL import Image

    im = Image.open(BytesIO(image_bytes)).convert("RGB")
    panels = split_scan_face_to_panels(im.width, im.height, face)
    panel_tpls = omr_tmpl.get("fold_panel_templates") or {}
    merged: dict[str, Any] = {}
    confs: list[float] = []
    details: list[str] = []

    for panel_num, box in panels.items():
        pcfg = panel_tpls.get(str(panel_num))
        if not isinstance(pcfg, dict) or not pcfg:
            details.append(f"P{panel_num}:şablon yoxdur")
            continue
        panel_jpeg = _crop_panel_jpeg(image_bytes, box)
        omr = _call_omr(
            panel_jpeg,
            pcfg,
            skip_qr=True,
            sheet_uuid_hint=sheet_uuid_hint,
            exam_id_hint=exam_id_hint,
        )
        ans = omr.get("answers") or {}
        if isinstance(ans, dict):
            merged.update(ans)
        confs.append(float(omr.get("confidence") or 0.0))
        if omr.get("status") == "error":
            details.append(f"P{panel_num}:{omr.get('detail') or omr.get('error') or 'error'}")
        elif omr.get("detail"):
            details.append(str(omr.get("detail")))

    conf = min(confs) if confs else 0.0
    detail = "; ".join(details)
    return merged, conf, detail


def _run_a3_fold_both_faces_omr(
    face1_bytes: bytes,
    face2_bytes: bytes | None,
    omr_tmpl: dict[str, Any],
    *,
    sheet_uuid_hint: str | None,
    exam_id_hint: int,
) -> tuple[dict[str, Any], float, str]:
    """Üz 1 + üz 2 cavablarını birləşdir."""
    a1, c1, d1 = _run_a3_fold_face_omr(
        face1_bytes, omr_tmpl, face=1, sheet_uuid_hint=sheet_uuid_hint, exam_id_hint=exam_id_hint
    )
    merged = dict(a1)
    confs = [c1]
    details = [d1] if d1 else []
    if face2_bytes:
        a2, c2, d2 = _run_a3_fold_face_omr(
            face2_bytes, omr_tmpl, face=2, sheet_uuid_hint=sheet_uuid_hint, exam_id_hint=exam_id_hint
        )
        merged.update(a2)
        confs.append(c2)
        if d2:
            details.append(d2)
    return merged, min(confs) if confs else 0.0, "; ".join(details)


def _omr_template_from_sheet_cfg(cfg: dict[str, Any]) -> dict[str, Any]:
    """
    Çap olunmuş PDF ilə parity: stale deyilsə dondurulmuş omr_template.
    Yalnız stale / yoxdursa get_omr_template ilə yenidən hesabla.
    """
    cfg = _invalidate_stale_omr_template_cfg(dict(cfg))
    frozen = cfg.get("omr_template")
    if isinstance(frozen, dict) and frozen:
        return frozen
    return get_omr_template(cfg)


def _mcq_blank_ratio(answers: dict[str, Any], question_count: int) -> float:
    if question_count <= 0:
        return 0.0
    blank = 0
    for i in range(1, question_count + 1):
        v = answers.get(f"Q{i}") or answers.get(f"q{i}") or ""
        if not str(v).strip():
            blank += 1
    return blank / float(question_count)


def _append_err(err: str | None, hint: str) -> str:
    return f"{err}; {hint}" if err else hint


def _student_missing_hint(answers: dict[str, Any], st_reason: str | None) -> str:
    if st_reason == "student_code_incomplete":
        return "Şagird kodu kartda tam doldurulmayıb"
    card = compose_card_identity(answers)
    code = card.get("student_code") or ""
    if code:
        return (
            f"Kart kodu {code} kursda qeydiyyatda deyil — nəticə kartdakı məlumatlarla saxlanılıb. "
            "Lazım olsa şagird təyin edin."
        )
    return "Bu kursda həmin 6 rəqəmli kodlu şagird yoxdur"


def _template_for_sheet_row(row: AnswerSheetTemplate | None, db: Any, exam: Exam) -> dict[str, Any]:
    if row and row.template_config:
        return _omr_template_from_sheet_cfg(dict(row.template_config))
    return _get_omr_template_for_exam(db, exam)


def _get_omr_template_for_exam(db: Any, exam: Exam) -> dict[str, Any]:
    """
    Exam üçün OMR template-i qaytarır.
    Əgər AnswerSheetTemplate-də saxlanılmış omr_template varsa onu istifadə edir,
    yoxdursa exam konfiqurasiyasından hesablayır.
    """
    latest_sheet = db.scalar(
        select(AnswerSheetTemplate)
        .where(
            AnswerSheetTemplate.exam_id == exam.id,
            AnswerSheetTemplate.is_draft.is_(False),
            AnswerSheetTemplate.pdf_path.is_not(None),
        )
        .order_by(AnswerSheetTemplate.id.desc())
    )
    if latest_sheet and latest_sheet.template_config:
        return _omr_template_from_sheet_cfg(dict(latest_sheet.template_config))

    # Fallback: exam-dən əsas konfiqurasiya
    exam_cfg = {
        "question_count": exam.question_count,
        "options_per_question": exam.options_per_question,
        "columns_count": getattr(exam, "columns_count", 2),
        "paper_size": "A4",
    }
    return get_omr_template(exam_cfg)


def _latest_template_config_for_exam(db: Any, exam_id: int) -> dict[str, Any]:
    latest = db.scalar(
        select(AnswerSheetTemplate)
        .where(
            AnswerSheetTemplate.exam_id == exam_id,
            AnswerSheetTemplate.is_draft.is_(False),
            AnswerSheetTemplate.pdf_path.is_not(None),
        )
        .order_by(AnswerSheetTemplate.id.desc())
    )
    if latest and latest.template_config:
        return dict(latest.template_config)
    return {}


def _latest_confirmed_sheet_row(db: Any, exam_id: int) -> AnswerSheetTemplate | None:
    return db.scalar(
        select(AnswerSheetTemplate)
        .where(
            AnswerSheetTemplate.exam_id == exam_id,
            AnswerSheetTemplate.is_draft.is_(False),
            AnswerSheetTemplate.pdf_path.is_not(None),
        )
        .order_by(AnswerSheetTemplate.id.desc())
    )


def _template_config_for_sheet_uuid(db: Any, exam_id: int, sheet_uuid: str) -> dict[str, Any]:
    row = db.scalar(
        select(AnswerSheetTemplate).where(
            AnswerSheetTemplate.exam_id == exam_id,
            AnswerSheetTemplate.sheet_uuid == str(sheet_uuid),
            AnswerSheetTemplate.is_draft.is_(False),
        )
    )
    if row and row.template_config:
        return dict(row.template_config)
    return {}


def _resolve_image_template_config(
    db: Any, exam_id: int, image_bytes: bytes, fallback: dict[str, Any]
) -> tuple[dict[str, Any], str | None]:
    """
    QR/sheet_uuid ilə şablon həll et.
    Qaytarır: (cfg, error_message). error_message dolu olanda fallback ilə OMR etmə.
    """
    normalized = _normalize_image_bytes_for_omr(image_bytes)
    qr_meta = _read_qr_from_omr_service(normalized)
    su = qr_meta.get("sheet_uuid")
    if not su:
        if fallback:
            return fallback, None
        return fallback, "QR oxunmadı — təsdiqlənmiş cavab kartı tapılmadı"
    cfg = _template_config_for_sheet_uuid(db, exam_id, str(su))
    if cfg:
        return cfg, None
    return fallback, f"Naməlum vərəq (sheet_uuid={su}) — şablon tapılmadı"


def _snapshot_session_corrections(db: Any, session_id: int) -> dict[str, list[dict[str, Any]]]:
    """sheet_uuid+şagird açarı → manual düzəlişlər (yenidən emalda bərpa üçün)."""
    rows = list(
        db.scalars(select(ScanResult).where(ScanResult.session_id == session_id).order_by(ScanResult.id)).all()
    )
    out: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        corrections = list(
            db.scalars(
                select(ManualCorrection)
                .where(ManualCorrection.scan_result_id == row.id)
                .order_by(ManualCorrection.id)
            ).all()
        )
        if not corrections:
            continue
        restore_key = _correction_restore_key(row.detected_answers or {}, row.student_id)
        if not restore_key:
            restore_key = row.image_path
        out[restore_key] = [
            {
                "corrected_answers": dict(c.corrected_answers or {}),
                "corrected_by": int(c.corrected_by),
            }
            for c in corrections
        ]
    return out


def _snapshot_session_essay_grades(db: Any, session_id: int) -> dict[str, list[dict[str, Any]]]:
    """sheet_uuid+şagird → essay grades (reprocess bərpası)."""
    rows = list(
        db.scalars(select(ScanResult).where(ScanResult.session_id == session_id).order_by(ScanResult.id)).all()
    )
    out: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grades = list(
            db.scalars(
                select(EssayGrade)
                .where(EssayGrade.scan_result_id == row.id)
                .order_by(EssayGrade.question_number)
            ).all()
        )
        if not grades:
            continue
        restore_key = _correction_restore_key(row.detected_answers or {}, row.student_id)
        if not restore_key:
            restore_key = row.image_path
        out[restore_key] = [
            {
                "question_number": int(g.question_number),
                "question_id": int(g.question_id) if g.question_id is not None else None,
                "awarded_points": float(g.awarded_points),
                "max_points": float(g.max_points),
                "notes": g.notes,
                "graded_by": int(g.graded_by),
            }
            for g in grades
        ]
    return out


def _essay_context_for_exam(db: Any, exam_id: int) -> tuple[set[int], dict[int, float], dict[int, str]]:
    q_rows = list(
        db.scalars(select(Question).where(Question.exam_id == exam_id).order_by(Question.order_index)).all()
    )
    essay_qnums = essay_question_numbers_from_questions(q_rows)
    essay_max = {
        int(q.order_index): float(q.points or 1.0) for q in q_rows if int(q.order_index) in essay_qnums
    }
    return essay_qnums, essay_max, question_types_from_questions(q_rows)


def _essay_grades_map_for_result(db: Any, result_id: int) -> dict[int, float]:
    grades = list(db.scalars(select(EssayGrade).where(EssayGrade.scan_result_id == result_id)).all())
    return {int(g.question_number): float(g.awarded_points) for g in grades}


def _reapply_session_essay_grades(session_id: int, snapshot: dict[str, list[dict[str, Any]]]) -> None:
    if not snapshot:
        return
    with SyncSessionLocal() as db:
        results = list(
            db.scalars(select(ScanResult).where(ScanResult.session_id == session_id).order_by(ScanResult.id)).all()
        )
        exam_id = None
        session = db.get(ScanSession, session_id)
        if session:
            exam_id = session.exam_id
        exam = db.get(Exam, exam_id) if exam_id else None
        keys = []
        essay_qnums: set[int] = set()
        essay_max: dict[int, float] = {}
        qtypes: dict[int, str] = {}
        if exam:
            keys = list(
                db.scalars(
                    select(AnswerKey).where(AnswerKey.exam_id == exam.id).order_by(AnswerKey.question_number)
                ).all()
            )
            essay_qnums, essay_max, qtypes = _essay_context_for_exam(db, exam.id)

        for row in results:
            restore_key = _correction_restore_key(row.detected_answers or {}, row.student_id) or row.image_path
            entries = snapshot.get(restore_key)
            if not entries:
                continue
            for entry in entries:
                db.add(
                    EssayGrade(
                        scan_result_id=row.id,
                        question_id=entry.get("question_id"),
                        question_number=int(entry["question_number"]),
                        awarded_points=float(entry.get("awarded_points") or 0),
                        max_points=float(entry.get("max_points") or 1),
                        notes=entry.get("notes"),
                        graded_by=int(entry["graded_by"]),
                    )
                )
            if exam and keys:
                eg_map = {
                    int(e["question_number"]): float(e.get("awarded_points") or 0) for e in entries
                }
                sheet_key = None
                su = (row.detected_answers or {}).get("__sheet_uuid__")
                if su:
                    sheet_row = db.scalar(
                        select(AnswerSheetTemplate).where(
                            AnswerSheetTemplate.exam_id == exam.id,
                            AnswerSheetTemplate.sheet_uuid == str(su),
                            AnswerSheetTemplate.is_draft.is_(False),
                        )
                    )
                    if sheet_row and sheet_row.template_config:
                        sk = sheet_row.template_config.get("sheet_answer_key")
                        sheet_key = sk if isinstance(sk, dict) else None
                score_v, max_v, breakdown = score_exam(
                    dict(row.detected_answers or {}),
                    keys,
                    exam,
                    sheet_answer_key=sheet_key,
                    essay_grades=eg_map,
                    essay_question_numbers=essay_qnums,
                    essay_max_points=essay_max,
                    question_types=qtypes,
                )
                row.score = score_v
                row.max_score = max_v
                row.score_breakdown = breakdown or None
                if essay_qnums and (breakdown or {}).get("pending_manual_count", 0) > 0:
                    if row.status == ResultStatus.OK:
                        row.status = ResultStatus.MANUAL_REVIEW
        db.commit()


def _reapply_session_corrections(session_id: int, snapshot: dict[str, list[dict[str, Any]]]) -> None:
    if not snapshot:
        return
    with SyncSessionLocal() as db:
        session = db.get(ScanSession, session_id)
        if session is None:
            return
        exam = db.get(Exam, session.exam_id)
        if exam is None:
            return
        keys = list(
            db.scalars(
                select(AnswerKey).where(AnswerKey.exam_id == exam.id).order_by(AnswerKey.question_number)
            ).all()
        )
        essay_qnums, essay_max, qtypes = _essay_context_for_exam(db, exam.id)
        results = list(
            db.scalars(select(ScanResult).where(ScanResult.session_id == session_id).order_by(ScanResult.id)).all()
        )
        for row in results:
            merged_probe = dict(row.detected_answers or {})
            restore_key = _correction_restore_key(merged_probe, row.student_id) or row.image_path
            entries = snapshot.get(restore_key)
            if not entries:
                continue
            merged = dict(row.detected_answers or {})
            for entry in entries:
                merged = merge_corrected_mcqs(merged, entry.get("corrected_answers") or {})

            sheet_key = None
            tpl_cfg = None
            su = merged.get("__sheet_uuid__")
            if su:
                sheet_row = db.scalar(
                    select(AnswerSheetTemplate).where(
                        AnswerSheetTemplate.exam_id == exam.id,
                        AnswerSheetTemplate.sheet_uuid == str(su),
                        AnswerSheetTemplate.is_draft.is_(False),
                    )
                )
                if sheet_row and sheet_row.template_config:
                    tpl_cfg = dict(sheet_row.template_config)
                    sk = tpl_cfg.get("sheet_answer_key")
                    sheet_key = sk if isinstance(sk, dict) else None

            eg_map = _essay_grades_map_for_result(db, row.id)
            score_v, max_v, breakdown = score_exam(
                merged,
                keys,
                exam,
                sheet_answer_key=sheet_key,
                essay_grades=eg_map,
                essay_question_numbers=essay_qnums,
                essay_max_points=essay_max,
                question_types=qtypes,
            )
            if max_v <= 0 and row.max_score is not None:
                max_v = float(row.max_score)

            new_sid, st_reason = resolve_student_id_from_scan(db, exam, merged, tpl_cfg)
            row.detected_answers = merged
            row.score = score_v
            row.max_score = max_v
            row.score_breakdown = breakdown or None
            row.student_id = new_sid
            if new_sid is None:
                row.status = ResultStatus.MANUAL_REVIEW
                if template_expects_student_code(tpl_cfg):
                    hint = _student_missing_hint(merged, st_reason)
                    prev = row.error_message or ""
                    row.error_message = f"{prev}; {hint}" if prev and hint not in prev else (prev or hint)
                else:
                    row.error_message = row.error_message or "Şagird təyin edilməyib"
            else:
                row.status = ResultStatus.OK
                row.error_message = None

            for entry in entries:
                db.add(
                    ManualCorrection(
                        scan_result_id=row.id,
                        corrected_answers=entry.get("corrected_answers") or {},
                        corrected_by=int(entry["corrected_by"]),
                    )
                )
        db.commit()


def _sync_session_progress(
    session_id: int,
    processed: int,
    *,
    status: SessionStatus | None = None,
    total: int | None = None,
) -> None:
    """UI faizi — hər kart emal olunanda yenilənir (yalnız job sonunda deyil)."""
    with SyncSessionLocal() as db:
        s = db.get(ScanSession, session_id)
        if s is None:
            return
        s.processed_images = processed
        if total is not None:
            s.total_images = total
        if status is not None:
            s.status = status
        elif s.status == SessionStatus.PENDING:
            s.status = SessionStatus.PROCESSING
        db.commit()


def _max_score_for_exam(db: Any, exam_id: int) -> float:
    exam = db.get(Exam, exam_id)
    if exam is None:
        return 0.0
    keys = list(
        db.scalars(
            select(AnswerKey).where(AnswerKey.exam_id == exam.id).order_by(AnswerKey.question_number)
        ).all()
    )
    return sum(float(k.points) for k in keys) if keys else 0.0


def _persist_notice_result(
    session_id: int,
    exam_id: int,
    logical_path: str,
    message: str,
    *,
    status: ResultStatus = ResultStatus.MANUAL_REVIEW,
) -> None:
    """Atılan səhifə, QR uyğunsuzluğu və s. üçün açıq ScanResult (səssiz itki yox)."""
    with SyncSessionLocal() as db:
        max_pts = _max_score_for_exam(db, exam_id)
        db.add(
            ScanResult(
                session_id=session_id,
                image_path=logical_path,
                detected_answers={},
                score=0.0,
                max_score=max_pts,
                status=status,
                error_message=message[:1024],
                processed_at=datetime.utcnow(),
            )
        )
        db.commit()


def _flag_duplicate_student_results(session_id: int) -> None:
    """Eyni sessiyada eyni şagird üçün təkrar nəticələri işarələ (hamısı, birinci daxil)."""
    with SyncSessionLocal() as db:
        rows = list(
            db.scalars(
                select(ScanResult)
                .where(ScanResult.session_id == session_id, ScanResult.student_id.is_not(None))
                .order_by(ScanResult.id.asc())
            ).all()
        )
        by_student: dict[int, list[ScanResult]] = {}
        for row in rows:
            sid = int(row.student_id)  # type: ignore[arg-type]
            by_student.setdefault(sid, []).append(row)
        changed = False
        dup_msg = "Eyni şagird üçün təkrar skan nəticəsi — manual yoxlama tələb olunur"
        for group in by_student.values():
            if len(group) <= 1:
                continue
            for row in group:
                if row.status == ResultStatus.OK:
                    row.status = ResultStatus.MANUAL_REVIEW
                    changed = True
                prev = row.error_message or ""
                if dup_msg not in prev:
                    row.error_message = f"{prev}; {dup_msg}" if prev else dup_msg
                    changed = True
        if changed:
            db.commit()


def _iter_zip_images(data: bytes) -> list[tuple[str, bytes]]:
    out: list[tuple[str, bytes]] = []
    with zipfile.ZipFile(BytesIO(data)) as zf:
        infos = [i for i in zf.infolist() if not i.is_dir()]
        if len(infos) > MAX_ZIP_MEMBERS:
            raise ValueError(f"ZIP çox fayl ehtiva edir (>{MAX_ZIP_MEMBERS})")
        total = sum(i.file_size for i in infos)
        if total > MAX_ZIP_UNCOMPRESSED_BYTES:
            raise ValueError("ZIP çıxarılmış ölçü həddi keçir")
        compressed = sum(i.compress_size for i in infos)
        if compressed > 0 and total / compressed > MAX_ZIP_COMPRESSION_RATIO:
            raise ValueError("ZIP sıxılma nisbəti həddindən yüksəkdir (zip-bomb qorunması)")
        for info in infos:
            lower = info.filename.lower()
            if lower.endswith(_IMAGE_EXT):
                out.append((info.filename, zf.read(info.filename)))
    return out


def _persist_result(
    session_id: int,
    exam_id: int,
    image_bytes: bytes,
    logical_path: str,
    *,
    face2_bytes: bytes | None = None,
) -> None:
    with SyncSessionLocal() as db:
        exam = db.get(Exam, exam_id)
        if exam is None:
            return
        keys = list(
            db.scalars(
                select(AnswerKey).where(AnswerKey.exam_id == exam.id).order_by(AnswerKey.question_number)
            ).all()
        )
        max_pts = sum(float(k.points) for k in keys) if keys else 0.0

        image_bytes = _normalize_image_bytes_for_omr(image_bytes)
        qr_meta = _read_qr_from_omr_service(image_bytes)
        qr_exam_id = qr_meta.get("exam_id_from_qr")
        if qr_exam_id is not None:
            try:
                if int(qr_exam_id) != int(exam.id):
                    _persist_notice_result(
                        session_id,
                        exam_id,
                        logical_path,
                        "Vərəq başqa imtahana aiddir (QR exam_id uyğunsuzluğu)",
                        status=ResultStatus.MANUAL_REVIEW,
                    )
                    return
            except (TypeError, ValueError):
                _persist_notice_result(
                    session_id,
                    exam_id,
                    logical_path,
                    "QR exam_id formatı etibarsızdır",
                    status=ResultStatus.MANUAL_REVIEW,
                )
                return

        su_pre = qr_meta.get("sheet_uuid")
        qr_fallback = False
        sheet_row: AnswerSheetTemplate | None = None

        if su_pre:
            sheet_row = db.scalar(
                select(AnswerSheetTemplate).where(
                    AnswerSheetTemplate.exam_id == exam.id,
                    AnswerSheetTemplate.sheet_uuid == str(su_pre),
                    AnswerSheetTemplate.is_draft.is_(False),
                )
            )
            if sheet_row is None:
                _persist_notice_result(
                    session_id,
                    exam_id,
                    logical_path,
                    f"Naməlum vərəq (sheet_uuid={su_pre}) — şablon tapılmadı",
                )
                return
        else:
            confirmed_count = int(
                db.scalar(
                    select(func.count())
                    .select_from(AnswerSheetTemplate)
                    .where(
                        AnswerSheetTemplate.exam_id == exam.id,
                        AnswerSheetTemplate.is_draft.is_(False),
                    )
                )
                or 0
            )
            sheet_row = _latest_confirmed_sheet_row(db, exam.id)
            if sheet_row is None:
                _persist_notice_result(
                    session_id,
                    exam_id,
                    logical_path,
                    "QR oxunmadı — təsdiqlənmiş cavab kartı yoxdur. İmtahanda kartı PDF endirib çap/skan edin.",
                )
                return
            if confirmed_count > 1:
                _persist_notice_result(
                    session_id,
                    exam_id,
                    logical_path,
                    "QR oxunmadı — imtahanda bir neçə cavab kartı variantı var; düzgün açarı seçmək mümkün deyil. "
                    "QR görünən tam səhifə skan yükləyin.",
                    status=ResultStatus.MANUAL_REVIEW,
                )
                return
            qr_fallback = True
            su_pre = sheet_row.sheet_uuid

        omr_tmpl = _template_for_sheet_row(sheet_row, db, exam)

        student_id: int | None = None
        breakdown: dict[str, Any] = {}
        essay_crop_paths: dict[str, str] | None = None

        try:
            tpl_cfg_probe = dict(sheet_row.template_config) if sheet_row and sheet_row.template_config else {}
            use_a3_fold = bool(
                omr_tmpl.get("a3_duplex_fold")
                or is_a3_duplex_fold(tpl_cfg_probe)
            )
            if use_a3_fold:
                if face2_bytes is not None:
                    # face1 = image_bytes (üz 1), face2 = arxa
                    face1_b = image_bytes
                    # Əgər tək fayl üz2 ipucu ilə gəlibsə, yalnız o üz
                    fh = _face_hint_from_filename(logical_path)
                    if fh == 2 and face2_bytes is None:
                        answers, conf_fold, detail_fold = _run_a3_fold_face_omr(
                            image_bytes,
                            omr_tmpl,
                            face=2,
                            sheet_uuid_hint=str(su_pre) if su_pre else None,
                            exam_id_hint=int(exam.id),
                        )
                    else:
                        answers, conf_fold, detail_fold = _run_a3_fold_both_faces_omr(
                            face1_b,
                            face2_bytes,
                            omr_tmpl,
                            sheet_uuid_hint=str(su_pre) if su_pre else None,
                            exam_id_hint=int(exam.id),
                        )
                else:
                    face = _face_hint_from_filename(logical_path) or 1
                    answers, conf_fold, detail_fold = _run_a3_fold_face_omr(
                        image_bytes,
                        omr_tmpl,
                        face=face,
                        sheet_uuid_hint=str(su_pre) if su_pre else None,
                        exam_id_hint=int(exam.id),
                    )
                omr_status = "ok"
                detail_l = (detail_fold or "").lower()
                if "şablon yoxdur" in detail_l or detail_l.startswith("p") and ":error" in detail_l.replace(" ", ""):
                    omr_status = "error"
                if any(x in detail_l for x in ("omr emal", "traceback", "exception")):
                    omr_status = "error"
                omr = {
                    "answers": answers,
                    "confidence": conf_fold,
                    "status": omr_status,
                    "detail": detail_fold,
                    "sheet_uuid": su_pre,
                }
            else:
                # Worker artıq /qr çağırıb — OMR-də təkrar QR skanını keç
                omr = _call_omr(
                    image_bytes,
                    omr_tmpl,
                    skip_qr=True,
                    sheet_uuid_hint=str(su_pre) if su_pre else None,
                    exam_id_hint=int(exam.id),
                )
            answers = omr.get("answers") or {}
            if not isinstance(answers, dict):
                answers = {}

            # Grid-in sütunlarını Q{n} çoxsimvollu cavaba birləşdir
            tpl_cfg_early = dict(sheet_row.template_config) if sheet_row and sheet_row.template_config else {}
            answers = compose_grid_in_from_detected(answers, tpl_cfg_early)

            # QR kodu ilə müəyyən edilmiş sheet_uuid metadata kimi əlavə et
            sheet_uuid_detected = omr.get("sheet_uuid") or su_pre
            if sheet_uuid_detected:
                answers["__sheet_uuid__"] = sheet_uuid_detected
            qr_txt = qr_meta.get("qr_raw") if isinstance(qr_meta.get("qr_raw"), str) else None
            if qr_txt and str(qr_txt).strip():
                answers["__qr_raw__"] = str(qr_txt).strip()

            sheet_key = None
            if sheet_row and sheet_row.template_config:
                sheet_key = sheet_row.template_config.get("sheet_answer_key")
            if not sheet_key and sheet_uuid_detected:
                row2 = db.scalar(
                    select(AnswerSheetTemplate).where(
                        AnswerSheetTemplate.exam_id == exam.id,
                        AnswerSheetTemplate.sheet_uuid == str(sheet_uuid_detected),
                        AnswerSheetTemplate.is_draft.is_(False),
                    )
                )
                if row2 and row2.template_config:
                    sheet_key = row2.template_config.get("sheet_answer_key")

            q_rows = list(
                db.scalars(select(Question).where(Question.exam_id == exam.id).order_by(Question.order_index)).all()
            )
            essay_qnums = essay_question_numbers_from_questions(q_rows)
            essay_max = {int(q.order_index): float(q.points or 1.0) for q in q_rows if int(q.order_index) in essay_qnums}

            score, max_score, breakdown = score_exam(
                answers,
                keys,
                exam,
                sheet_answer_key=sheet_key if isinstance(sheet_key, dict) else None,
                essay_question_numbers=essay_qnums,
                essay_max_points=essay_max,
                question_types=question_types_from_questions(q_rows),
            )
            tpl_src = sheet_row
            if not tpl_src and sheet_uuid_detected:
                tpl_src = db.scalar(
                    select(AnswerSheetTemplate).where(
                        AnswerSheetTemplate.exam_id == exam.id,
                        AnswerSheetTemplate.sheet_uuid == str(sheet_uuid_detected),
                        AnswerSheetTemplate.is_draft.is_(False),
                    )
                )
            tpl_cfg = dict(tpl_src.template_config) if tpl_src and tpl_src.template_config else None
            student_id, st_reason = resolve_student_id_from_scan(db, exam, answers, tpl_cfg)
            conf = float(omr.get("confidence") or 0.0)
            st = ResultStatus.OK
            err = None
            q_count = int(exam.question_count or 0)
            blank_ratio = _mcq_blank_ratio(answers if isinstance(answers, dict) else {}, q_count)
            omr_detail_s = str(omr.get("detail") or "")
            if omr.get("status") == "error":
                st = ResultStatus.ERROR
                omr_detail = str(omr.get("detail") or omr.get("error") or "OMR emal uğursuz")
                err = f"OMR emal xətası — {omr_detail[:900]}"
            elif conf < settings.omr_confidence_threshold or omr.get("status") == "manual_review":
                st = ResultStatus.MANUAL_REVIEW
                if omr_detail_s == "omrchecker_alignment_failed":
                    err = _append_err(
                        err,
                        "Kart şablona uyğunlaşdırıla bilmədi — tam səhifə skan/foto yükləyin (ankerlər və QR görünməlidir)",
                    )
                elif omr_detail_s == "omrchecker_multi_marked" or int(omr.get("multi_marked") or 0) > 0:
                    err = _append_err(
                        err,
                        "Bəzi xanalarda qeyri-müəyyən/çoxlu işarələmə aşkarlandı — manual yoxlayın",
                    )
            if essay_qnums and (breakdown or {}).get("pending_manual_count", 0) > 0 and st != ResultStatus.ERROR:
                st = ResultStatus.MANUAL_REVIEW
                err = _append_err(err, "Açıq (essay) suallar əl ilə qiymətləndirmə gözləyir")

            # Essay crop-lar
            essay_crop_paths: dict[str, str] | None = None
            if tpl_cfg and essay_qnums:
                try:
                    storage = StorageService()
                    bucket = settings.minio_bucket_uploads
                    essay_crop_paths = {}
                    if use_a3_fold and face2_bytes is not None:
                        for face_n, face_b in ((1, image_bytes), (2, face2_bytes)):
                            crops = crop_essay_regions_for_scan(face_b, tpl_cfg, face=face_n)
                            for qn_s, jpeg in (crops or {}).items():
                                key = f"{logical_path.rsplit('/', 1)[0]}/essay_q{qn_s}_{uuid.uuid4().hex[:8]}.jpg"
                                storage.upload_bytes(bucket, key, jpeg, "image/jpeg")
                                essay_crop_paths[qn_s] = key
                    else:
                        face_for_crop = (_face_hint_from_filename(logical_path) or 1) if use_a3_fold else None
                        crops = crop_essay_regions_for_scan(
                            image_bytes,
                            tpl_cfg,
                            face=face_for_crop,
                        )
                        if crops:
                            for qn_s, jpeg in crops.items():
                                key = f"{logical_path.rsplit('/', 1)[0]}/essay_q{qn_s}_{uuid.uuid4().hex[:8]}.jpg"
                                storage.upload_bytes(bucket, key, jpeg, "image/jpeg")
                                essay_crop_paths[qn_s] = key
                    if not essay_crop_paths:
                        essay_crop_paths = None
                except Exception:
                    essay_crop_paths = None
            if blank_ratio >= 0.9 and q_count > 0 and st != ResultStatus.ERROR:
                st = ResultStatus.MANUAL_REVIEW
                if omr_detail_s == "omrchecker_alignment_failed":
                    err = _append_err(
                        err,
                        "Cavablar oxunmadı (bal 0) — şablon/align uyğunsuzluğu; kartı yenidən skan edin",
                    )
                else:
                    err = _append_err(
                        err,
                        "Cavablar oxunmadı (bal 0) — bal sıfır demək deyil ki açar səhvdir; kart oxunmayıb",
                    )
            if template_expects_student_code(tpl_cfg) and student_id is None and st != ResultStatus.ERROR:
                st = ResultStatus.MANUAL_REVIEW
                err = _append_err(err, _student_missing_hint(answers if isinstance(answers, dict) else {}, st_reason))
            if qr_fallback:
                # Uğurlu oxunuşda yalnız yumşaq qeyd — statusu “OK”dan zorla düşürmə
                err = _append_err(err, QR_FALLBACK_NOTICE)
                if st == ResultStatus.OK and blank_ratio >= 0.5:
                    st = ResultStatus.MANUAL_REVIEW
        except Exception as e:  # noqa: BLE001
            answers = {}
            score, max_score, breakdown = 0.0, max_pts, {}
            st = ResultStatus.ERROR
            err = str(e)[:1024]
            student_id = None
            essay_crop_paths = None
        db.add(
            ScanResult(
                session_id=session_id,
                student_id=student_id,
                image_path=logical_path,
                detected_answers=answers if isinstance(answers, dict) else {},
                score=score,
                max_score=max_score,
                score_breakdown=breakdown if isinstance(breakdown, dict) and breakdown else None,
                status=st,
                error_message=err,
                processed_at=datetime.utcnow(),
                essay_crops=essay_crop_paths,
            )
        )
        db.commit()


def _persist_zip_error(session_id: int, exam_id: int, logical_path: str, message: str) -> None:
    with SyncSessionLocal() as db:
        exam = db.get(Exam, exam_id)
        keys = (
            list(
                db.scalars(
                    select(AnswerKey).where(AnswerKey.exam_id == exam_id).order_by(AnswerKey.question_number)
                ).all()
            )
            if exam
            else []
        )
        max_pts = sum(float(k.points) for k in keys) if keys else 0.0
        db.add(
            ScanResult(
                session_id=session_id,
                image_path=logical_path,
                detected_answers={},
                score=0.0,
                max_score=max_pts,
                status=ResultStatus.ERROR,
                error_message=message[:1024],
                processed_at=datetime.utcnow(),
            )
        )
        db.commit()


def _save_work_image(storage: StorageService, bucket: str, session_id: int, image_bytes: bytes) -> str:
    key = f"scans/{session_id}/work/{uuid.uuid4().hex}.jpg"
    storage.upload_bytes(bucket, key, image_bytes, "image/jpeg")
    return key


def _bump_session_processed(session_id: int) -> int:
    """processed_images += 1 (atomik) — fan-out sheet task-larından."""
    with SyncSessionLocal() as db:
        s = db.get(ScanSession, session_id)
        if s is None:
            return 0
        s.processed_images = int(s.processed_images or 0) + 1
        n = int(s.processed_images)
        db.commit()
        return n


def _finalize_scan_session(session_id: int, lock_token: str | None) -> dict[str, Any]:
    snapshot = pop_session_correction_snapshot(session_id)
    essay_snap = pop_session_essay_snapshot(session_id)
    _reapply_session_corrections(session_id, snapshot)
    _reapply_session_essay_grades(session_id, essay_snap)
    _flag_duplicate_student_results(session_id)
    with SyncSessionLocal() as db:
        s = db.get(ScanSession, session_id)
        processed = 0
        if s:
            processed = int(s.processed_images or 0)
            s.status = SessionStatus.DONE
            s.finished_at = datetime.utcnow()
            db.commit()
    requeue = pop_scan_session_reprocess_pending(session_id)
    release_scan_session_lock(session_id, lock_token)
    clear_session_finalize_claim(session_id)
    if requeue:
        process_scan_session.delay(session_id)
        return {"session_id": session_id, "processed": processed, "requeued": True}
    return {"session_id": session_id, "processed": processed, "done": True}


@celery_app.task(
    bind=True,
    name="scan.process_sheet",
    max_retries=2,
    retry_backoff=True,
    retry_backoff_max=120,
)
def process_scan_sheet(
    self,
    session_id: int,
    exam_id: int,
    storage_key: str,
    logical_path: str,
    lock_token: str | None = None,
    face2_storage_key: str | None = None,
) -> dict[str, Any]:
    """Bir cavab kartı — paralel fan-out üçün. A3 fold: face2_storage_key opsional."""
    storage = StorageService()
    bucket = settings.minio_bucket_uploads
    extend_scan_session_lock(session_id, lock_token)

    def _complete() -> None:
        _bump_session_processed(session_id)
        left = decr_session_sheet_pending(session_id)
        # Yalnız 1→0 keçidində və SETNX claim alan worker finalize edir
        if left == 0 and try_claim_session_finalize(session_id):
            _finalize_scan_session(session_id, lock_token)

    try:
        image_bytes = storage.get_bytes(bucket, storage_key)
        face2_bytes = None
        if face2_storage_key:
            try:
                face2_bytes = storage.get_bytes(bucket, face2_storage_key)
            except Exception:  # noqa: BLE001
                face2_bytes = None
        _persist_result(
            session_id,
            exam_id,
            image_bytes,
            logical_path,
            face2_bytes=face2_bytes,
        )
        _complete()
        return {"session_id": session_id, "logical_path": logical_path}
    except httpx.HTTPError as e:
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e)
        _persist_notice_result(
            session_id,
            exam_id,
            logical_path,
            f"OMR/HTTP xətası: {str(e)[:400]}",
            status=ResultStatus.ERROR,
        )
        _complete()
        return {"session_id": session_id, "logical_path": logical_path, "error": True}
    except Exception as e:  # noqa: BLE001
        _persist_notice_result(
            session_id,
            exam_id,
            logical_path,
            f"Emal xətası: {str(e)[:400]}",
            status=ResultStatus.ERROR,
        )
        _complete()
        return {"session_id": session_id, "logical_path": logical_path, "error": True}


@celery_app.task(
    bind=True,
    name="scan.process_session",
    max_retries=2,
    autoretry_for=(httpx.HTTPError,),
    retry_backoff=True,
    retry_backoff_max=120,
)
def process_scan_session(self, session_id: int) -> dict[str, Any]:
    lock_token = acquire_scan_session_lock(session_id)
    if lock_token is None:
        with SyncSessionLocal() as db:
            sess = db.get(ScanSession, session_id)
            stale_processing = (
                sess is not None
                and sess.status == SessionStatus.PROCESSING
                and not is_scan_session_locked(session_id)
            )
        if stale_processing:
            recover_stale_session_pending(session_id)
            lock_token = force_acquire_scan_session_lock(session_id)
        else:
            mark_scan_session_reprocess_pending(session_id)
            return {"error": "session already processing", "session_id": session_id, "requeue": True}

    storage = StorageService()
    bucket = settings.minio_bucket_uploads
    storage.ensure_bucket(bucket)
    queued_async = False

    try:
        with SyncSessionLocal() as db:
            sess = db.get(ScanSession, session_id)
            if sess is None:
                return {"error": "session not found"}
            exam_id = sess.exam_id
            correction_snapshot = _snapshot_session_corrections(db, session_id)
            essay_snapshot = _snapshot_session_essay_grades(db, session_id)
            subq = select(ScanResult.id).where(ScanResult.session_id == session_id)
            db.execute(delete(ManualCorrection).where(ManualCorrection.scan_result_id.in_(subq)))
            db.execute(delete(ScanResult).where(ScanResult.session_id == session_id))
            sess.status = SessionStatus.PROCESSING
            sess.processed_images = 0
            sess.finished_at = None
            db.commit()

            exam = db.get(Exam, exam_id)
            if exam is None:
                with SyncSessionLocal() as db_err:
                    s = db_err.get(ScanSession, session_id)
                    if s:
                        s.status = SessionStatus.ERROR
                        db_err.commit()
                return {"error": "exam not found"}

        store_session_correction_snapshot(session_id, correction_snapshot)
        store_session_essay_snapshot(session_id, essay_snapshot)

        prefix = f"scans/{session_id}/"
        try:
            names = storage.list_object_names(bucket, prefix)
        except Exception as e:  # noqa: BLE001
            with SyncSessionLocal() as db2:
                s = db2.get(ScanSession, session_id)
                if s:
                    s.status = SessionStatus.ERROR
                    db2.commit()
            return {"error": str(e)}

        # Köhnə work/ fayllarını siyahıdan çıxar (yenidən emal)
        names = [n for n in names if "/work/" not in n.replace("\\", "/")]

        collected: list[tuple[str, bytes]] = []
        inline_errors = 0
        for name in sorted(names, key=_natural_sort_key):
            if name.endswith("/"):
                continue
            lower = name.lower()
            try:
                data = storage.get_bytes(bucket, name)
            except Exception as e:  # noqa: BLE001
                _persist_notice_result(
                    session_id,
                    exam_id,
                    name,
                    f"Fayl oxunmadı: {str(e)[:200]}",
                    status=ResultStatus.ERROR,
                )
                inline_errors += 1
                continue
            if lower.endswith(".zip"):
                try:
                    items = _iter_zip_images(data)
                except ValueError as e:
                    _persist_zip_error(session_id, exam_id, f"{name}:zip", str(e))
                    inline_errors += 1
                    continue
                for fname, img in items:
                    collected.append((f"{name}:{fname}", img))
            elif lower.endswith(_IMAGE_EXT):
                collected.append((name, data))

        with SyncSessionLocal() as db:
            default_tpl_cfg = _latest_template_config_for_exam(db, exam_id)

        a3_fold_mode = is_a3_duplex_fold(default_tpl_cfg or {})
        if len(collected) >= 2:
            with SyncSessionLocal() as db:
                first_cfg, _ = _resolve_image_template_config(
                    db, exam_id, collected[0][1], default_tpl_cfg
                )
                a3_fold_mode = a3_fold_mode or is_a3_duplex_fold(first_cfg or {})
                two_page_stitched = (
                    not a3_fold_mode
                    and first_cfg.get("single_page_layout") is False
                    and bool(first_cfg.get("omr_two_page_stitched"))
                )
        else:
            two_page_stitched = False

        # (storage_key, logical_path, face2_storage_key|None)
        jobs: list[tuple[str, str, str | None]] = []

        if a3_fold_mode:
            a3_pairs = _pair_collected_for_a3_fold(collected)
            for f1_name, f1_b, f2_name, f2_b in a3_pairs:
                extend_scan_session_lock(session_id, lock_token)
                if f1_name.startswith("scans/") and ":" not in f1_name and f1_name.lower().endswith(_IMAGE_EXT):
                    key1 = f1_name
                else:
                    key1 = _save_work_image(storage, bucket, session_id, f1_b)
                key2 = None
                if f2_name and f2_b:
                    if f2_name.startswith("scans/") and ":" not in f2_name and f2_name.lower().endswith(_IMAGE_EXT):
                        key2 = f2_name
                    else:
                        key2 = _save_work_image(storage, bucket, session_id, f2_b)
                jobs.append((key1, f1_name, key2))
        elif two_page_stitched:
            stitch_pairs = _pair_collected_for_stitch(collected)
            for top_name, top_b, bot_name, bot_b in stitch_pairs:
                extend_scan_session_lock(session_id, lock_token)
                if bot_name and bot_b:
                    merged = _stitch_images_vertical(top_b, bot_b)
                    storage_key = _save_stitched_image(storage, bucket, session_id, merged)
                    jobs.append((storage_key, storage_key, None))
                elif top_name.startswith("scans/") and ":" not in top_name:
                    jobs.append((top_name, top_name, None))
                else:
                    key = _save_work_image(storage, bucket, session_id, top_b)
                    jobs.append((key, top_name, None))
        else:
            with SyncSessionLocal() as db:
                for fname, img in collected:
                    extend_scan_session_lock(session_id, lock_token)
                    cfg, tpl_err = _resolve_image_template_config(db, exam_id, img, default_tpl_cfg)
                    if tpl_err:
                        _persist_notice_result(session_id, exam_id, fname, tpl_err)
                        inline_errors += 1
                        continue
                    if not _scan_image_allowed_for_template(fname, cfg):
                        _persist_notice_result(
                            session_id,
                            exam_id,
                            fname,
                            "İki səhifəli kart: 1-ci səhifə skan edilmir (yalnız MCQ səhifəsi gözlənilir)",
                        )
                        inline_errors += 1
                        continue
                    if fname.startswith("scans/") and ":" not in fname and fname.lower().endswith(_IMAGE_EXT):
                        jobs.append((fname, fname, None))
                    else:
                        key = _save_work_image(storage, bucket, session_id, img)
                        jobs.append((key, fname, None))

        total = len(jobs) + inline_errors
        _sync_session_progress(
            session_id,
            inline_errors,
            status=SessionStatus.PROCESSING,
            total=total,
        )

        if not jobs:
            with SyncSessionLocal() as db:
                s = db.get(ScanSession, session_id)
                if s:
                    s.processed_images = inline_errors
                    s.status = SessionStatus.DONE
                    s.finished_at = datetime.utcnow()
                    db.commit()
            if pop_scan_session_reprocess_pending(session_id):
                process_scan_session.delay(session_id)
            return {"session_id": session_id, "processed": inline_errors, "queued": 0}

        set_session_sheet_pending(session_id, len(jobs))
        for storage_key, logical, face2_key in jobs:
            process_scan_sheet.delay(
                session_id, exam_id, storage_key, logical, lock_token, face2_key
            )
        queued_async = True
        return {"session_id": session_id, "queued": len(jobs), "inline_errors": inline_errors}
    except httpx.HTTPError:
        with SyncSessionLocal() as db_fail:
            s = db_fail.get(ScanSession, session_id)
            if s and s.status == SessionStatus.PROCESSING:
                s.status = SessionStatus.ERROR
                db_fail.commit()
        raise
    except Exception as e:  # noqa: BLE001
        with SyncSessionLocal() as db_fail:
            s = db_fail.get(ScanSession, session_id)
            if s:
                s.status = SessionStatus.ERROR
                db_fail.commit()
        return {"error": str(e)[:512], "session_id": session_id}
    finally:
        if not queued_async:
            release_scan_session_lock(session_id, lock_token)
