"""
OMRChecker şablonu — backend `get_omr_template` ilə PDF / skan tam uyğun.

Köhnə müstəqil hesab (timing zolağı, şaquli tower, origin) silinib; təkrarlanan
L dəyərləri səbəbindən PDF ilə sürüşmə riski aradan qaldırılıb.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any


def _ensure_backend_on_path() -> None:
    """Docker: /opt/imtahan. Lokal dev: repo/backend."""
    candidates = [
        Path("/opt/imtahan"),
        Path(__file__).resolve().parent.parent / "backend",
    ]
    for p in candidates:
        if (p / "app" / "services" / "pdf_generator.py").is_file():
            s = str(p.resolve())
            if s not in sys.path:
                sys.path.insert(0, s)
            return
    raise ImportError(
        "Backend app tapılmadı — OMR şablonu üçün PYTHONPATH və ya Docker build "
        "(backend qovluğunun kopyası) lazımdır.",
    )


def build_template_config(exam_config: dict[str, Any]) -> dict[str, Any]:
    """
    Tam OMRChecker JSON (pageDimensions, fieldBlocks, …).

    Əvvəlcədən tam şablon göndərilərsə, toxunulmur.
    Əks halda backend `get_omr_template` çağırılır (PDF generate ilə eyni məntiq).
    """
    if "pageDimensions" in exam_config and "fieldBlocks" in exam_config:
        return dict(exam_config)

    _ensure_backend_on_path()
    from app.services.pdf_generator import get_omr_template

    return get_omr_template(dict(exam_config))
