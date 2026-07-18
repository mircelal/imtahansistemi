"""Azərbaycan latını və ümumi mətn üçün TTF şrift qeydiyyatı (ReportLab)."""
from __future__ import annotations

import os

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

_done = False


def _font_paths() -> tuple[str | None, str | None]:
    env = os.environ.get("DEJAVU_FONT_DIR", "").strip()
    if env:
        reg = os.path.join(env, "DejaVuSans.ttf")
        bld = os.path.join(env, "DejaVuSans-Bold.ttf")
        if os.path.isfile(reg):
            return reg, bld if os.path.isfile(bld) else reg
    # Repo / app daxilində bündl edilmiş font
    app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    bundled = os.path.join(app_dir, "assets", "fonts", "DejaVuSans.ttf")
    bundled_b = os.path.join(app_dir, "assets", "fonts", "DejaVuSans-Bold.ttf")
    if os.path.isfile(bundled):
        return bundled, bundled_b if os.path.isfile(bundled_b) else bundled
    base = "/usr/share/fonts/truetype/dejavu"
    reg = os.path.join(base, "DejaVuSans.ttf")
    bld = os.path.join(base, "DejaVuSans-Bold.ttf")
    if os.path.isfile(reg):
        return reg, bld if os.path.isfile(bld) else reg
    windir = os.environ.get("WINDIR", r"C:\Windows")
    win = os.path.join(windir, "Fonts", "arial.ttf")
    if os.path.isfile(win):
        return win, win
    return None, None


def register_pdf_fonts() -> tuple[str, str]:
    """Qaytarır: (normal_font_name, bold_font_name). Fallback: Helvetica."""
    global _done
    if _done:
        if "AzSans" in pdfmetrics.getRegisteredFontNames():
            return "AzSans", "AzSans-Bold"
        return "Helvetica", "Helvetica-Bold"
    reg, bld = _font_paths()
    if reg:
        pdfmetrics.registerFont(TTFont("AzSans", reg))
        pdfmetrics.registerFont(TTFont("AzSans-Bold", bld or reg))
        _done = True
        return "AzSans", "AzSans-Bold"
    _done = True
    return "Helvetica", "Helvetica-Bold"


def pdf_font_embed_status() -> dict[str, str | bool]:
    """Çap checklist: TTF tapılıbsa ReportLab «AzSans» ilə embed olunur."""
    reg, bld = _font_paths()
    return {
        "ttf_normal_found": bool(reg),
        "ttf_bold_found": bool(bld),
        "mode": "AzSans_TTF" if reg else "Helvetica_fallback",
    }
