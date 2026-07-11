from io import BytesIO
import json
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.deps import ensure_exam_access, ensure_exam_write, get_current_user
from app.models.entities import AnswerSheetTemplate, Exam, User
from app.schemas.answer_sheets import (
    AnswerSheetAuditResponse,
    AnswerSheetDraftRequest,
    AnswerSheetDraftSaved,
    AnswerSheetGenerateRequest,
    AnswerSheetGenerateResponse,
    AnswerSheetPreviewRequest,
    GradeMcqCsvRequest,
    GradeMcqCsvResponse,
    GradeMcqCsvRowOut,
    SheetListItem,
    SheetLookupResponse,
)
from app.services.answer_sheet_preset_merge import build_merged_answer_sheet_config
from app.services.layout_audit import (
    audit_answer_sheet_layout,
    layout_publishability_issues,
    verify_generated_pdf_matches_audit,
)
from app.services.layout_normalize import apply_layout_publish_guards
from app.services.mcq_sections import enrich_mcq_sections_from_grading
from app.services.pdf_generator import (
    generate_answer_sheet_pdf,
    get_omr_template,
    pdf_page_png,
)
from app.services.exam_branding import load_header_logo_bytes_for_exam
from app.services.exam_readiness import assert_answer_key_complete
from app.services.student_resolve import merge_student_identity_into_config
from app.services.storage import StorageService

router = APIRouter(prefix="/api/answer-sheets", tags=["answer-sheets"])
settings = get_settings()


def _prepare_answer_sheet_config(cfg: dict[str, Any], grading_config: dict[str, Any] | None = None) -> dict[str, Any]:
    """Freeform şablonlarda istifadəçi mövqelərini saxla; fənn qruplarını imtahandan doldur."""
    out = enrich_mcq_sections_from_grading(dict(cfg), grading_config)
    preserve = out.get("layout_mode") == "freeform"
    return apply_layout_publish_guards(out, preserve_identity_positions=preserve)


def _strip_header_logo(cfg: dict) -> dict:
    out = dict(cfg)
    out.pop("header_logo_bytes", None)
    return out


@router.post("/generate", response_model=AnswerSheetGenerateResponse)
async def generate_answer_sheet(
    payload: AnswerSheetGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Yeni DIM-standartlı cavab kartı PDF yaradır və MinIO-ya yükləyir."""
    merged, exam_row, eff_pid = await build_merged_answer_sheet_config(
        db=db,
        user=user,
        exam_id=payload.exam_id,
        template_config=payload.template_config,
        layout_preset_id=payload.layout_preset_id,
        require_write=True,
    )
    if exam_row is None:
        raise HTTPException(status_code=404, detail="İmtahan tapılmadı")
    await assert_answer_key_complete(db, exam_row)
    cfg = merge_student_identity_into_config(dict(merged))
    if exam_row:
        lb, _ct = await load_header_logo_bytes_for_exam(db, exam_row)
        if lb:
            cfg["header_logo_bytes"] = lb
    cfg = _prepare_answer_sheet_config(
        cfg,
        dict(exam_row.grading_config or {}) if exam_row else None,
    )
    audit = audit_answer_sheet_layout(cfg)
    layout_issues = layout_publishability_issues(audit)
    if layout_issues:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "LAYOUT_NOT_PUBLISHABLE",
                "message": "Layout yoxlamasından keçmədiyi üçün PDF yaradılmadı. Parametrləri düzəldin və ya auditə baxın.",
                "layout_warnings": layout_issues,
                "dim_layout_mm_reference": audit.get("dim_layout_mm_reference"),
            },
        )

    pdf_bytes, sheet_uuid = generate_answer_sheet_pdf(cfg, payload.exam_id)
    pdf_verify = verify_generated_pdf_matches_audit(pdf_bytes, audit)
    if pdf_verify:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "PDF_LAYOUT_INCONSISTENT",
                "message": "Yaradılan PDF kağız ölçüsü audit ilə uyğun gəlmir — server inzibatçısına bildirin.",
                "issues": pdf_verify,
            },
        )

    cfg_omr = _strip_header_logo(cfg)
    config_with_template = dict(cfg_omr)
    config_with_template["omr_template"] = get_omr_template(cfg_omr)

    object_path = f"exam-{payload.exam_id}/{sheet_uuid}.pdf"
    storage = StorageService()
    storage.upload_bytes(settings.minio_bucket_sheets, object_path, pdf_bytes, "application/pdf")

    row = AnswerSheetTemplate(
        exam_id=payload.exam_id,
        sheet_uuid=sheet_uuid,
        template_config=config_with_template,
        pdf_path=object_path,
        is_draft=False,
        layout_preset_id=eff_pid,
    )
    db.add(row)
    await db.commit()

    return AnswerSheetGenerateResponse(
        pdf_path=object_path,
        sheet_uuid=sheet_uuid,
        download_url=f"/api/answer-sheets/exam/{payload.exam_id}/download-by-sheet/{sheet_uuid}",
        layout_warnings=list(audit.get("layout_warnings") or []),
    )


@router.post("/audit", response_model=AnswerSheetAuditResponse)
async def audit_answer_sheet(
    payload: AnswerSheetPreviewRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Layout təhlükəsizliyi və çap checklist — PDF generasiyası olmadan."""
    merged, exam_row, _ = await build_merged_answer_sheet_config(
        db=db,
        user=user,
        exam_id=payload.exam_id,
        template_config=payload.template_config,
        layout_preset_id=payload.layout_preset_id,
        require_write=False,
    )
    cfg = merge_student_identity_into_config(dict(merged))
    if exam_row:
        lb, _ = await load_header_logo_bytes_for_exam(db, exam_row)
        if lb:
            cfg["header_logo_bytes"] = lb
    cfg = _prepare_answer_sheet_config(
        cfg,
        dict(exam_row.grading_config or {}) if exam_row else None,
    )
    data = audit_answer_sheet_layout(cfg)
    issues = layout_publishability_issues(data)
    return AnswerSheetAuditResponse(
        paper=str(data["paper"]),
        page_mm=list(data["page_mm"]),
        content_right_mm=float(data["content_right_mm"]),
        safe_bottom_mm=float(data["safe_bottom_mm"]),
        layout_warnings=list(data.get("layout_warnings") or []),
        print_checklist=list(data.get("print_checklist") or []),
        font_status=dict(data.get("font_status") or {}),
        dim_layout_mm_reference=dict(data["dim_layout_mm_reference"])
        if isinstance(data.get("dim_layout_mm_reference"), dict)
        else None,
        two_page_required=bool(data.get("two_page_required")),
        effective_single_page_layout=bool(data.get("effective_single_page_layout", True)),
        publishable=len(issues) == 0,
        effective_template_config=_strip_header_logo(cfg),
    )


@router.post("/draft", response_model=AnswerSheetDraftSaved)
async def save_answer_sheet_draft(
    payload: AnswerSheetDraftRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Kart parametrlərini PDF olmadan saxlayır (skan üçün sonra PDF ilə təsdiqləyin)."""
    merged, exam_row, eff_pid = await build_merged_answer_sheet_config(
        db=db,
        user=user,
        exam_id=payload.exam_id,
        template_config=payload.template_config,
        layout_preset_id=payload.layout_preset_id,
        require_write=True,
    )
    if exam_row is None:
        raise HTTPException(status_code=404, detail="İmtahan tapılmadı")
    await assert_answer_key_complete(db, exam_row)
    cfg = merge_student_identity_into_config(dict(merged))
    if exam_row:
        lb, _ = await load_header_logo_bytes_for_exam(db, exam_row)
        if lb:
            cfg["header_logo_bytes"] = lb
    cfg = _prepare_answer_sheet_config(
        cfg,
        dict(exam_row.grading_config or {}) if exam_row else None,
    )
    cfg_clean = _strip_header_logo(cfg)
    sheet_uuid = str(uuid4())
    row = AnswerSheetTemplate(
        exam_id=payload.exam_id,
        sheet_uuid=sheet_uuid,
        template_config=cfg_clean,
        pdf_path=None,
        is_draft=True,
        layout_preset_id=eff_pid,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return AnswerSheetDraftSaved(id=row.id, sheet_uuid=str(row.sheet_uuid or sheet_uuid))


@router.post(
    "/exam/{exam_id}/templates/{template_id}/finalize",
    response_model=AnswerSheetGenerateResponse,
)
async def finalize_answer_sheet_draft(
    exam_id: int,
    template_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Qaralamadan PDF yaradır, MinIO-ya yazır və şablonu skan üçün aktiv edir."""
    await ensure_exam_write(exam_id, user, db)
    row = await db.get(AnswerSheetTemplate, template_id)
    if row is None or row.exam_id != exam_id:
        raise HTTPException(status_code=404, detail="Şablon tapılmadı")
    if not row.is_draft:
        raise HTTPException(status_code=400, detail="Bu kart artıq təsdiqlənib")
    if not row.sheet_uuid:
        raise HTTPException(status_code=400, detail="sheet_uuid çatışmır")

    cfg = merge_student_identity_into_config(dict(row.template_config or {}))
    exam_row = await db.get(Exam, exam_id)
    if exam_row is None:
        raise HTTPException(status_code=404, detail="İmtahan tapılmadı")
    await assert_answer_key_complete(db, exam_row)
    if exam_row:
        lb, _ = await load_header_logo_bytes_for_exam(db, exam_row)
        if lb:
            cfg["header_logo_bytes"] = lb
    cfg = _prepare_answer_sheet_config(
        cfg,
        dict(exam_row.grading_config or {}) if exam_row else None,
    )
    audit = audit_answer_sheet_layout(cfg)
    layout_issues = layout_publishability_issues(audit)
    if layout_issues:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "LAYOUT_NOT_PUBLISHABLE",
                "message": "Layout yoxlamasından keçmədiyi üçün PDF təsdiqlənmədi.",
                "layout_warnings": layout_issues,
                "dim_layout_mm_reference": audit.get("dim_layout_mm_reference"),
            },
        )

    pdf_bytes, su_out = generate_answer_sheet_pdf(cfg, exam_id, sheet_uuid=row.sheet_uuid)
    pdf_verify = verify_generated_pdf_matches_audit(pdf_bytes, audit)
    if pdf_verify:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "PDF_LAYOUT_INCONSISTENT",
                "message": "Yaradılan PDF audit ilə uyğun gəlmir.",
                "issues": pdf_verify,
            },
        )
    if su_out != row.sheet_uuid:
        row.sheet_uuid = su_out

    cfg_omr = _strip_header_logo(cfg)
    row.template_config = {**cfg_omr, "omr_template": get_omr_template(cfg_omr)}
    object_path = f"exam-{exam_id}/{row.sheet_uuid}.pdf"
    storage = StorageService()
    storage.upload_bytes(settings.minio_bucket_sheets, object_path, pdf_bytes, "application/pdf")
    row.pdf_path = object_path
    row.is_draft = False
    await db.commit()

    return AnswerSheetGenerateResponse(
        pdf_path=object_path,
        sheet_uuid=row.sheet_uuid or "",
        download_url=f"/api/answer-sheets/exam/{exam_id}/download-by-sheet/{row.sheet_uuid}",
        layout_warnings=list(audit.get("layout_warnings") or []),
    )


@router.get("/exam/{exam_id}/templates", response_model=list[SheetListItem])
async def list_exam_sheet_templates(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """İmtahana aid yaradılmış bütün cavab kartları (tanınma üçün)."""
    await ensure_exam_access(exam_id, user, db)
    rows = (
        await db.scalars(
            select(AnswerSheetTemplate)
            .where(AnswerSheetTemplate.exam_id == exam_id)
            .order_by(AnswerSheetTemplate.id.desc())
        )
    ).all()
    out: list[SheetListItem] = []
    for r in rows:
        tc = r.template_config or {}
        out.append(
            SheetListItem(
                id=r.id,
                sheet_uuid=r.sheet_uuid,
                participant_label=tc.get("participant_label"),
                participant_code=tc.get("participant_code") or tc.get("sheet_code"),
                pdf_path=r.pdf_path,
                is_draft=bool(r.is_draft),
                created_at=r.created_at,
            )
        )
    return out


@router.get("/exam/{exam_id}/download-by-sheet/{sheet_uuid}")
async def download_sheet_by_uuid(
    exam_id: int,
    sheet_uuid: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Müəyyən UUID-li cavab kartını PDF endirir (JWT ilə)."""
    await ensure_exam_access(exam_id, user, db)
    row = await db.scalar(
        select(AnswerSheetTemplate).where(
            AnswerSheetTemplate.exam_id == exam_id,
            AnswerSheetTemplate.sheet_uuid == sheet_uuid,
        )
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Kart tapılmadı")
    if row.is_draft or not row.pdf_path:
        raise HTTPException(status_code=404, detail="PDF hələ yaradılmayıb — qaralamanı təsdiqləyin")

    storage = StorageService()
    data = storage.get_bytes(settings.minio_bucket_sheets, row.pdf_path)
    safe = sheet_uuid[:8]
    filename = f"imtahan-{exam_id}-kart-{safe}.pdf"
    return StreamingResponse(
        BytesIO(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/sheets/{sheet_uuid}", response_model=SheetLookupResponse)
async def get_sheet_by_uuid(
    sheet_uuid: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """QR kodunda olan sheet_uuid ilə sheet məlumatını qaytarır."""
    row = await db.scalar(
        select(AnswerSheetTemplate).where(AnswerSheetTemplate.sheet_uuid == sheet_uuid)
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Sheet tapılmadı")
    await ensure_exam_access(row.exam_id, user, db)
    return SheetLookupResponse(
        sheet_uuid=row.sheet_uuid,
        exam_id=row.exam_id,
        template_config=row.template_config,
        created_at=row.created_at,
    )


@router.get("/{exam_id}/download")
async def download_answer_sheet(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Son yaradılmış cavab kartını PDF kimi endirmə."""
    await ensure_exam_access(exam_id, user, db)
    latest = await db.scalar(
        select(AnswerSheetTemplate)
        .where(
            AnswerSheetTemplate.exam_id == exam_id,
            AnswerSheetTemplate.is_draft.is_(False),
            AnswerSheetTemplate.pdf_path.is_not(None),
        )
        .order_by(AnswerSheetTemplate.id.desc())
    )
    if latest is None or not latest.pdf_path:
        raise HTTPException(status_code=404, detail="Template tapılmadı")

    storage = StorageService()
    data = storage.get_bytes(settings.minio_bucket_sheets, latest.pdf_path)
    filename = f"exam-{exam_id}-cavab-karti.pdf"
    return StreamingResponse(
        BytesIO(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{exam_id}/omr-template")
async def get_exam_omr_template(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Exam üçün OMRChecker template JSON-ını qaytarır."""
    await ensure_exam_access(exam_id, user, db)
    latest = await db.scalar(
        select(AnswerSheetTemplate)
        .where(
            AnswerSheetTemplate.exam_id == exam_id,
            AnswerSheetTemplate.is_draft.is_(False),
            AnswerSheetTemplate.pdf_path.is_not(None),
        )
        .order_by(AnswerSheetTemplate.id.desc())
    )
    if latest is None:
        raise HTTPException(status_code=404, detail="Template tapılmadı")

    cfg = dict(latest.template_config or {})
    cfg = _invalidate_stale_omr_template(cfg)
    if "omr_template" in cfg:
        return cfg["omr_template"]
    return get_omr_template(cfg)


def _invalidate_stale_omr_template(cfg: dict[str, Any]) -> dict[str, Any]:
    """Yalnız açıq stale flag olduqda saxlanmış OMR şablonunu sil."""
    if cfg.get("_omr_template_stale"):
        cfg.pop("omr_template", None)
        cfg.pop("_omr_template_stale", None)
    return cfg


@router.post("/preview")
async def preview_answer_sheet(
    payload: AnswerSheetPreviewRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cavab kartının PNG önizləməsini qaytarır."""
    merged, exam_row, _ = await build_merged_answer_sheet_config(
        db=db,
        user=user,
        exam_id=payload.exam_id,
        template_config=payload.template_config,
        layout_preset_id=payload.layout_preset_id,
        require_write=False,
    )
    cfg_prev = merge_student_identity_into_config(dict(merged))
    if exam_row:
        lb, _ = await load_header_logo_bytes_for_exam(db, exam_row)
        if lb:
            cfg_prev["header_logo_bytes"] = lb
    cfg_prev = _prepare_answer_sheet_config(
        cfg_prev,
        dict(exam_row.grading_config or {}) if exam_row else None,
    )
    audit = audit_answer_sheet_layout(cfg_prev)
    issues = layout_publishability_issues(audit)
    pdf_bytes, _ = generate_answer_sheet_pdf(cfg_prev, payload.exam_id)
    png = pdf_page_png(pdf_bytes, max(0, int(payload.page_index)))
    headers = {
        "X-Publishable": "true" if len(issues) == 0 else "false",
        "X-Layout-Warnings": json.dumps(list(audit.get("layout_warnings") or []), ensure_ascii=False),
    }
    return Response(content=png, media_type="image/png", headers=headers)


def _normalize_answer_key_for_grading(raw: dict) -> dict[int, str]:
    out: dict[int, str] = {}
    for k, v in raw.items():
        if v is None or str(v).strip() == "":
            continue
        ks = str(k).strip().lower()
        if ks.startswith("q"):
            ks = ks[1:]
        try:
            qi = int(ks)
        except ValueError:
            continue
        letter = str(v).strip().upper()[:1]
        if letter in ("A", "B", "C", "D", "E"):
            out[qi] = letter
    return out


def _parse_mcq_csv_rows(csv_text: str) -> list[dict[str, str]]:
    import csv
    from io import StringIO

    f = StringIO(csv_text.strip())
    reader = csv.DictReader(f)
    if not reader.fieldnames:
        return []
    rows: list[dict[str, str]] = []
    for row in reader:
        rows.append({(k or "").strip(): (v or "").strip() for k, v in row.items()})
    return rows


@router.post("/tools/grade-mcq-csv", response_model=GradeMcqCsvResponse)
async def grade_mcq_csv(
    body: GradeMcqCsvRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    CSV-də hər sətir bir tələbə; sütunlar sual nömrələri (1 və ya q1).
    Cavab açarı ilə müqayisə: düzgün/səhv/boş sayı və bal.
    """
    await ensure_exam_access(body.exam_id, user, db)
    key = _normalize_answer_key_for_grading(body.answer_key)
    if not key:
        raise HTTPException(status_code=400, detail="answer_key boşdur və ya etibarsızdır")

    csv_rows = _parse_mcq_csv_rows(body.csv_text)
    if not csv_rows:
        raise HTTPException(status_code=400, detail="CSV boşdur və ya başlıq sətri yoxdur")

    q_nums = sorted(key.keys())
    max_score = float(len(q_nums))

    out_rows: list[GradeMcqCsvRowOut] = []
    for idx, row in enumerate(csv_rows):
        correct = wrong = blank = 0
        for qi in q_nums:
            cell = (
                row.get(str(qi))
                or row.get(f"q{qi}")
                or row.get(f"Q{qi}")
                or ""
            ).strip().upper()
            if not cell:
                blank += 1
                continue
            ans = cell[:1]
            if ans == key[qi]:
                correct += 1
            else:
                wrong += 1
        score = float(correct)
        label = None
        lower_keys = {((k or "").strip().lower()): k for k in row if k}
        for cand in ("ad", "name", "soyad", "surname", "id", "kod"):
            orig = lower_keys.get(cand)
            if orig and (row.get(orig) or "").strip():
                label = (row.get(orig) or "").strip()
                break
        out_rows.append(
            GradeMcqCsvRowOut(
                row_index=idx + 1,
                label=label,
                correct=correct,
                wrong=wrong,
                blank=blank,
                score=score,
                max_score=max_score,
            )
        )

    total_c = sum(r.correct for r in out_rows)
    total_w = sum(r.wrong for r in out_rows)
    total_b = sum(r.blank for r in out_rows)
    summary = f"{len(out_rows)} sətir; ümumi düzgün {total_c}, səhv {total_w}, boş {total_b}"
    return GradeMcqCsvResponse(rows=out_rows, summary=summary)
