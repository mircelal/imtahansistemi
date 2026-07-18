import json
import os
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from processor import _parse_qr, _read_qr, process_omr
from schemas import ValidateTemplateRequest
from template_manager import build_template_config

app = FastAPI(title="OMR Service")

# Sync CPU işi event loop-u bloklamasın (uvicorn workers=1 olsa belə)
_EXECUTOR = ThreadPoolExecutor(max_workers=max(1, int(os.environ.get("OMR_THREAD_POOL", "2") or "2")))


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
    import subprocess
    import sys
    from pathlib import Path

    omr_root = Path(__import__("os").environ.get("OMRCHECKER_ROOT", "/opt/OMRChecker"))
    ok = False
    detail = "unknown"
    try:
        proc = subprocess.run(
            [sys.executable, "-c", "from src.entry import entry_point"],
            cwd=str(omr_root),
            capture_output=True,
            text=True,
            timeout=30,
        )
        ok = proc.returncode == 0
        detail = "ready" if ok else (proc.stderr or proc.stdout or "")[-200:]
    except Exception as exc:  # noqa: BLE001
        detail = str(exc)[:200]
    return {"status": "ok" if ok else "degraded", "omrchecker": ok, "detail": detail}


@app.post("/qr")
async def decode_qr_only(file: UploadFile = File(...)):
    """Yalnız QR oxunur — düzgün OMR şablonunu seçmək üçün (worker)."""
    content = await file.read()
    raw = _read_qr(content)
    sheet_uuid, exam_id = _parse_qr(raw)
    return {"qr_raw": raw, "sheet_uuid": sheet_uuid, "exam_id_from_qr": exam_id}


@app.post("/process")
async def process(
    file: UploadFile = File(...),
    template_config: str = Form("{}"),
    skip_qr: str = Form("0"),
    sheet_uuid_hint: str = Form(""),
    exam_id_hint: str = Form(""),
):
    payload = _parse_template_config(template_config)
    if str(skip_qr).strip() in {"1", "true", "yes", "on"}:
        payload["_skip_qr"] = True
    if sheet_uuid_hint and str(sheet_uuid_hint).strip():
        payload["_sheet_uuid_hint"] = str(sheet_uuid_hint).strip()
    if exam_id_hint and str(exam_id_hint).strip():
        try:
            payload["_exam_id_hint"] = int(str(exam_id_hint).strip())
        except ValueError:
            pass
    content = await file.read()
    loop = __import__("asyncio").get_event_loop()
    result = await loop.run_in_executor(_EXECUTOR, process_omr, content, payload)
    return result


@app.post("/batch")
@app.post("/process/batch")
async def process_batch(files: list[UploadFile] = File(...), template_config: str = Form("{}")):
    payload = _parse_template_config(template_config)
    results = []
    loop = __import__("asyncio").get_event_loop()
    for item in files:
        content = await item.read()
        results.append(await loop.run_in_executor(_EXECUTOR, process_omr, content, payload))
    return {"results": results}


@app.post("/validate-template")
async def validate_template(body: ValidateTemplateRequest):
    generated = build_template_config(body.template_config)
    return {"status": "ok", "template": generated}
