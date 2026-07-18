"""Nümunə foto ilə OMR + ground truth müqayisəsi (imtahan 9 / sheet 1107b6f6)."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import httpx
from sqlalchemy import select

# Ground truth — skaner nümunəsi (IMG_…810) əllə oxunuş
GT_ANSWERS = {
    1: "B", 2: "C", 3: "D", 4: "B", 5: "C", 6: "A", 7: "D", 8: "B", 9: "C", 10: "E",
    11: "D", 12: "B", 13: "C", 14: "A", 15: "B", 16: "E", 17: "B", 18: "A", 19: "E", 20: "D",
    21: "E", 22: "D", 23: "A", 24: "E", 25: "B", 26: "D", 27: "A", 28: "C", 29: "B", 30: "C",
}

GT_IDENTITY_HINTS = {
    "name_contains": "BABA",
    "student_digits": "12345",
    "variant": "A",
}


def extract_mcq(det: dict) -> dict[int, str]:
    out: dict[int, str] = {}
    for k, v in det.items():
        ks = str(k)
        if ks.startswith("__"):
            continue
        m = re.match(r"^[Qq]?(\d+)$", ks)
        if not m:
            continue
        n = int(m.group(1))
        s = str(v or "").strip().upper()
        if s and s[0] in "ABCDE":
            out[n] = s[0]
    return out


def compare_answers(got: dict[int, str], exp: dict[int, str]) -> tuple[int, list[str]]:
    ok = 0
    mism: list[str] = []
    for n, e in exp.items():
        g = got.get(n, "")
        if g == e:
            ok += 1
        else:
            mism.append(f"Q{n}: got={g or '∅'} exp={e}")
    return ok, mism


def main() -> int:
    from app.config import get_settings
    from app.database_sync import SyncSessionLocal
    from app.models.entities import AnswerSheetTemplate, Exam
    from app.services.exam_lifecycle import exam_lifecycle_status
    from app.worker.scan_tasks import _omr_template_from_sheet_cfg

    db = SyncSessionLocal()
    try:
        exam = db.get(Exam, 9)
        assert exam is not None
        print("EXAM", exam.id, exam.title, "lifecycle=", exam_lifecycle_status(exam))
        sheets = list(
            db.scalars(
                select(AnswerSheetTemplate)
                .where(AnswerSheetTemplate.exam_id == 9, AnswerSheetTemplate.is_draft.is_(False))
                .order_by(AnswerSheetTemplate.id.desc())
            ).all()
        )
        print("sheets", [(s.id, str(s.sheet_uuid)[:12], bool((s.template_config or {}).get("omr_template"))) for s in sheets])
        sheet = next((s for s in sheets if str(s.sheet_uuid or "").startswith("1107b6f6")), None) or (sheets[0] if sheets else None)
        if sheet is None:
            print("NO SHEET")
            return 1
        cfg = dict(sheet.template_config or {})
        omr_tpl = _omr_template_from_sheet_cfg(cfg)
        if not omr_tpl:
            print("NO omr template")
            return 1
        print("sheet", sheet.id, sheet.sheet_uuid)
    finally:
        db.close()

    images = [
        Path("/tmp/IMG_20260714_193810.jpg.jpeg"),
        Path("/tmp/IMG_20260714_193822.jpg.jpeg"),
    ]
    images = [p for p in images if p.is_file()]
    if not images:
        print("no images in /tmp")
        return 2

    settings = get_settings()
    omr_url = settings.omr_service_url.rstrip("/") + "/process"

    worst = 30
    for img_path in images:
        print("\n===", img_path.name, "===")
        body = img_path.read_bytes()
        with httpx.Client(timeout=180.0) as client:
            r = client.post(
                omr_url,
                files={"file": (img_path.name, body, "image/jpeg")},
                data={"template_config": json.dumps(omr_tpl)},
            )
        print("http", r.status_code)
        if r.status_code != 200:
            print(r.text[:800])
            continue
        data = r.json()
        det = data.get("detected_answers") or data.get("answers") or {}
        if not isinstance(det, dict):
            print("bad det", type(det), str(data)[:400])
            continue
        id_keys = sorted(k for k in det if str(k).lower().startswith("id_"))
        print("id fields:", {k: det[k] for k in id_keys[:40]})
        # also non-id alphanumeric fields that aren't Q
        extras = {k: v for k, v in det.items() if not str(k).upper().startswith("Q") and not str(k).startswith("__")}
        print("non-Q keys count", len(extras))

        mcq = extract_mcq(det)
        ok, mism = compare_answers(mcq, GT_ANSWERS)
        worst = min(worst, ok)
        print(f"answers {ok}/30 filled={len(mcq)}")
        if mism:
            print("miss:", "; ".join(mism[:15]))
            if len(mism) > 15:
                print(f"... +{len(mism)-15} more")

        Path(f"/tmp/omr_dump_{img_path.name}.json").write_text(
            json.dumps({"match": ok, "mcq": mcq, "det": det, "meta": {k: data.get(k) for k in data if k != "detected_answers"}}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    print("\nWORST", worst, "/30")
    return 0 if worst >= 28 else 3


if __name__ == "__main__":
    sys.exit(main())
