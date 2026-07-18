"""Bir kartda process_omr wall-time (early-exit sonrası)."""
from __future__ import annotations

import json
import time
from pathlib import Path

import processor as P

tpl = P._resolve_template({"omr_template": json.loads(Path("/tmp/tpl43.json").read_text())})
for path in ("/tmp/scan810.jpg", "/tmp/scan822.jpg"):
    raw = Path(path).read_bytes()
    t0 = time.perf_counter()
    res = P.process_omr(raw, {"omr_template": tpl, "_skip_qr": True, "_exam_id_hint": 9})
    dt = time.perf_counter() - t0
    ans = res.get("answers") or {}
    code = "".join(str(ans.get(f"id_student_code{i}") or "") for i in range(1, 7))
    ad = "".join(str(ans.get(f"id_ad{i:02d}") or "") for i in range(1, 8))
    print(f"{path}: {dt:.2f}s status={res.get('status')} detail={res.get('detail')} code={code} ad={ad}")
