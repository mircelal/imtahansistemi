"""
Cavab kartı layout spesifikasiyası — mm, təhlükəsiz zona, çap checklist.

Rəsmi DİM ölçüləri hüquqi nümunədən təsdiqlənəndə bu fayldakı REFERENCE_TABLE
rəqəmləri yenilənir; kod `L_BASE` (dim_sheet_layout) ilə sinxron saxlanılmalıdır.
"""
from __future__ import annotations

from typing import Any

# Ofis printer non-printable zona üçün əlavə buffer (mm) — məzmun kənarına yaxın düşməsin
SAFE_CONTENT_INSET_MM = 2.5

# Şəxsiyyət freeform-da şaquli stack üçün minimum boşluq — audit overlap pad ilə uyğun: 2*max(1.2,0.8)+0.2
MIN_IDENTITY_STACK_GAP_MM = 2.6

# Freeform sahələr arası minimum məsafə (bbox–bbox) — toxunma / OMR riski
MIN_FREE_FORM_FIELD_GAP_MM = 1.2

# MCQ şəbəkəsi footer xəttindən əvvəl minimum boşluq (mm)
MIN_GRID_ABOVE_FOOTER_MM = 0.5

# Freeform: şəxsiyyət `id_h` hesabında MCQ üçün saxlanılan minimum vertikal zolaq (mm) —
# `mcq_grid.top_mm` avto olduqda `mx_bottom` bütün səhifəni əhatə etməsin.
MIN_FREE_FORM_MCQ_RESERVE_MM = 72.0

# Çap əməliyyatı üçün qısa checklist (API `print_checklist` ilə qaytarıla bilər)
PRINT_CHECKLIST_AZ: tuple[str, ...] = (
    "PDF çapında «Actual size» / «100%» seçin; «Fit to page» söndürün.",
    "Kağız: A4 (şablona uyğun); ofis printerdə «Borderless» söndürün.",
    "Nümunə çapdan sonra şaquli və üfüqi ölçüləri ruler ilə yoxlayın.",
    "Mətn və balonlar kəsilmirsə — printer sürücüsündə minimum margin təyinini yoxlayın.",
    "Serverdə DejaVu və ya Arial TTF olmasa PDF Helvetica ilə gedə bilər — AZ hərfləri üçün TTF quraşdırın.",
)


def reference_layout_table() -> dict[str, Any]:
    """
    Daxili referans cədvəli (mm) — dim_sheet_layout.L_BASE ilə uyğunluq yoxlanmalıdır.
    """
    return {
        "margin_side_mm": 12.0,
        "timing_track_mm": 7.0,
        "header_bar_mm": 9.8,
        "footer_zone_mm": 9.0,
        "fiducial_outer_r_mm": 3.0,
        "default_bubble_d_mm": 6.0,
        "sep_identity_to_mcq_mm": 1.5,
        "notes": "content_left_mm = margin_side + timing_track; grid bottom <= page_h - margin - footer.",
    }


def print_checklist(paper_key: str | None = None) -> list[str]:
    base = list(PRINT_CHECKLIST_AZ)
    if not paper_key:
        return base
    key = str(paper_key).strip().upper()
    paper_line = {
        "A4": "Kağız: A4 (210×297 mm).",
        "A4L": "Kağız: A4 üfüqi (297×210 mm).",
        "A3": "Kağız: A3 (297×420 mm).",
        "A3L": "Kağız: A3 üfüqi (420×297 mm).",
    }.get(key, f"Kağız: {key} (şablona uyğun).")
    out: list[str] = []
    for line in base:
        if line.startswith("Kağız:"):
            out.append(paper_line)
        else:
            out.append(line)
    return out
