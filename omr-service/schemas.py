from typing import Any

from pydantic import BaseModel


class ProcessResponse(BaseModel):
    answers: dict[str, str]
    confidence: float
    status: str
    multi_marked: int = 0
    blank_ratio: float = 0.0
    detail: str = ""
    sheet_uuid: str | None = None
    exam_id_from_qr: int | None = None


class ValidateTemplateRequest(BaseModel):
    template_config: dict[str, Any]
