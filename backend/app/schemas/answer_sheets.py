from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AnswerSheetGenerateRequest(BaseModel):
    exam_id: int
    template_config: dict[str, Any] | None = None
    """İmtahana bağlı saxlanılmış cavab kartı şablonu (və ya sorğu zamanı göndərilir)."""
    layout_preset_id: int | None = None


class AnswerSheetDraftRequest(BaseModel):
    exam_id: int
    template_config: dict[str, Any] | None = None
    layout_preset_id: int | None = None


class AnswerSheetDraftSaved(BaseModel):
    id: int
    sheet_uuid: str
    message: str = "Qaralama saxlanıldı"


class AnswerSheetPreviewRequest(BaseModel):
    exam_id: int
    template_config: dict[str, Any] | None = None
    layout_preset_id: int | None = None
    page_index: int = 0


class AnswerSheetTemplateOut(BaseModel):
    id: int
    exam_id: int
    sheet_uuid: str | None
    template_config: dict[str, Any]
    pdf_path: str
    created_at: datetime

    class Config:
        from_attributes = True


class AnswerSheetGenerateResponse(BaseModel):
    pdf_path: str
    sheet_uuid: str
    download_url: str
    layout_warnings: list[str] = Field(default_factory=list)


class AnswerSheetAuditResponse(BaseModel):
    paper: str
    page_mm: list[float]
    content_right_mm: float
    safe_bottom_mm: float
    layout_warnings: list[str]
    print_checklist: list[str]
    font_status: dict[str, Any] | None = None
    dim_layout_mm_reference: dict[str, Any] | None = Field(
        default=None,
        description="DİM mm istinadı (L_BASE / timing) — dizayner sinxron yoxlaması üçün.",
    )
    two_page_required: bool = False
    effective_single_page_layout: bool = True
    publishable: bool = True
    effective_template_config: dict[str, Any] | None = Field(
        default=None,
        description="PDF generasiyası üçün merge+enrich+normalize sonrası konfiq (logo bytes istisna).",
    )


class SheetLookupResponse(BaseModel):
    """QR kodu ilə skan edildikdə sheet_uuid → exam məlumatı."""
    sheet_uuid: str
    exam_id: int
    template_config: dict[str, Any]
    created_at: datetime


class GradeMcqCsvRequest(BaseModel):
    """Sətir başlıqları: q1,q2,... və ya 1,2,... (böyük/kiçik hərf)."""

    exam_id: int
    csv_text: str
    answer_key: dict[str, str]


class GradeMcqCsvRowOut(BaseModel):
    row_index: int
    label: str | None = None
    correct: int
    wrong: int
    blank: int
    score: float
    max_score: float


class GradeMcqCsvResponse(BaseModel):
    rows: list[GradeMcqCsvRowOut]
    summary: str


class SheetListItem(BaseModel):
    id: int
    sheet_uuid: str | None
    participant_label: str | None = None
    participant_code: str | None = None
    pdf_path: str | None = None
    is_draft: bool = False
    created_at: datetime

    class Config:
        from_attributes = True
