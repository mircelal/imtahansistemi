import json

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from processor import _parse_qr, _read_qr, process_omr
from schemas import ValidateTemplateRequest
from template_manager import build_template_config

app = FastAPI(title="OMR Service")


def _parse_template_config(raw: str) -> dict:
    if not raw or not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid template JSON: {e}") from e
    if data is not None and not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="template_config must be a JSON object")
    return data or {}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/qr")
async def decode_qr_only(file: UploadFile = File(...)):
    """Yalnız QR oxunur — düzgün OMR şablonunu seçmək üçün (worker)."""
    content = await file.read()
    raw = _read_qr(content)
    sheet_uuid, exam_id = _parse_qr(raw)
    return {"qr_raw": raw, "sheet_uuid": sheet_uuid, "exam_id_from_qr": exam_id}


@app.post("/process")
async def process(file: UploadFile = File(...), template_config: str = Form("{}")):
    payload = _parse_template_config(template_config)
    content = await file.read()
    result = process_omr(content, payload)
    return result


@app.post("/batch")
@app.post("/process/batch")
async def process_batch(files: list[UploadFile] = File(...), template_config: str = Form("{}")):
    payload = _parse_template_config(template_config)
    results = []
    for item in files:
        content = await item.read()
        results.append(process_omr(content, payload))
    return {"results": results}


@app.post("/validate-template")
async def validate_template(body: ValidateTemplateRequest):
    generated = build_template_config(body.template_config)
    return {"status": "ok", "template": generated}
