"""
DİM tipli sual kitabçası layout spesifikasiyası (mm).

Cavab kartı `dim_sheet_layout.L_BASE` ilə eyni vizual dil: process magenta, fiducial,
12 mm yan margin, AzSans tipografiya. Rəsmi DİM kitabça nümunəsindən ölçü təsdiqlənəndə
REFERENCE_TABLE yenilənir.
"""

from __future__ import annotations

from typing import Any

from app.services.dim_sheet_layout import L_BASE, TIMING_TRACK_MM, content_left_mm

# Cavab kartı ilə eyni çap checklist
from app.services.sheet_layout_spec import PRINT_CHECKLIST_AZ, SAFE_CONTENT_INSET_MM

# Kitabça məzmun zonası — cavab kartı margin sistemi
BOOKLET_MARGIN_SIDE_MM = float(L_BASE["margin"])
BOOKLET_TIMING_TRACK_MM = float(TIMING_TRACK_MM)
BOOKLET_CONTENT_LEFT_MM = float(content_left_mm())
BOOKLET_FOOTER_ZONE_MM = float(L_BASE["footer_h"])
BOOKLET_HEADER_BAR_MM = float(L_BASE["header_h"])

# Üz qapağı
BOOKLET_COVER_VARIANT_BOX_MM = 28.0
BOOKLET_COVER_VARIANT_FONT_PT = 22.0
BOOKLET_COVER_TITLE_FONT_PT = 11.0
BOOKLET_COVER_MAIN_TITLE_PT = 18.0

# Sual səhifəsi
BOOKLET_BODY_FONT_PT = 10.5
BOOKLET_BODY_LEADING_PT = 14.0
BOOKLET_QNUM_FONT_PT = 11.0
BOOKLET_SECTION_FONT_PT = 12.0
BOOKLET_RUNNING_HEADER_PT = 7.5
BOOKLET_RUNNING_FOOTER_PT = 6.8

# Rəsmi DİM tipli təlimat mətni (sual kitabçası)
DIM_BOOKLET_INSTRUCTIONS_AZ: tuple[str, ...] = (
    "Sualları diqqətlə oxuyun. Cavabları yalnız cavab kartında (optik formada) qeyd edin.",
    "Hər sual üçün yalnız bir cavab variantı seçin. Birdən çox işarələnmiş cavab yanlış hesab olunur.",
    "Çoxtan seçimli suallarda göstərilən variant sayından artıq seçim etməyin.",
    "Doğru/Yanlış tipli suallarda yalnız bir cavab işarələyin.",
    "Sual kitabçasına heç bir yazı yazmaq, işarələmək və ya düzəliş etmək qadağandır.",
    "Qaralama aparmaq üçün ayrıca vərəq istifadə edin.",
    "Kalkulyator, mobil telefon, smart saat və qadağan edilmiş materiallardan istifadə etməyin.",
    "Vaxt bitdikdə sual kitabçasını və cavab kartını nəzarətçiyə təhvil verin.",
    "Variant kodu cavab kartınızdakı variant ilə eyni olmalıdır.",
)

DIM_BOOKLET_FOOTER_NOTICE = (
    "DİQQƏT: Sual kitabçasına yazı yazmaq qadağandır! Cavablar yalnız cavab kartında qeyd edilir."
)

DEFAULT_BOOKLET_VARIANTS: tuple[str, ...] = ("A", "B", "C", "D")


def reference_booklet_layout_table() -> dict[str, Any]:
    return {
        "margin_side_mm": BOOKLET_MARGIN_SIDE_MM,
        "timing_track_mm": BOOKLET_TIMING_TRACK_MM,
        "content_left_mm": BOOKLET_CONTENT_LEFT_MM,
        "header_bar_mm": BOOKLET_HEADER_BAR_MM,
        "footer_zone_mm": BOOKLET_FOOTER_ZONE_MM,
        "cover_variant_box_mm": BOOKLET_COVER_VARIANT_BOX_MM,
        "safe_content_inset_mm": SAFE_CONTENT_INSET_MM,
        "notes": "Kitabça vizual dil cavab kartı L_BASE ilə sinxron; variant kodu qapaq + səhifə başlığında.",
    }


def print_checklist_booklet() -> list[str]:
    return list(PRINT_CHECKLIST_AZ) + [
        "Kitabça variant hərfi cavab kartındakı variant ilə eyni olmalıdır.",
        "Qapaq və sual səhifələrində DİM process magenta zolağı kəsilməməlidir.",
    ]


def resolve_booklet_config(grading_config: dict[str, Any] | None) -> dict[str, Any]:
    """grading_config.booklet_config — sektor/imtahan təşkilatçı parametrləri."""
    gc = grading_config or {}
    raw = gc.get("booklet_config")
    cfg: dict[str, Any] = dict(raw) if isinstance(raw, dict) else {}
    variants = cfg.get("variants")
    if not isinstance(variants, list) or not variants:
        variants = list(DEFAULT_BOOKLET_VARIANTS)
    else:
        variants = [str(v).strip().upper()[:8] for v in variants if str(v).strip()]
        if not variants:
            variants = list(DEFAULT_BOOKLET_VARIANTS)
    cfg["variants"] = variants
    cfg.setdefault("organiser", "Dövlət İmtahan Mərkəzi")
    cfg.setdefault("sector", "")
    cfg.setdefault("exam_series", "")
    return cfg
