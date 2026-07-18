"""
Cavab kartı layout audit — sahə daşması, kəsişmə, MCQ/footer, səhifə sığması.
"""
from __future__ import annotations

import math
from typing import Any

from app.services.dim_identity import (
    identity_field_audit_boxes,
    identity_field_display_name,
    resolve_identity_fields,
)
from app.services.dim_sheet_layout import (
    L_BASE,
    TIMING_TRACK_MM,
    answer_sheet_two_page_required,
    content_left_mm,
    effective_layout_config,
    freeform_mcq_grid_top_anchor_mm,
    identity_height_mm,
    identity_zone_top_mm,
    max_questions_fit_below_identity,
    mcq_content_bottom_mm,
)
from app.services.pdf_generator import PAPERS
from app.services.pdf_fonts import pdf_font_embed_status
from app.services.sheet_layout_spec import (
    MIN_FREE_FORM_FIELD_GAP_MM,
    MIN_GRID_ABOVE_FOOTER_MM,
    SAFE_CONTENT_INSET_MM,
    print_checklist,
)
from reportlab.lib.units import mm as mm_u


def dim_layout_mm_reference() -> dict[str, float]:
    """
    DİM / Examine əl ilə ruler müqayisəsi üçün cari kodun əsas mm dəyərləri.

    Export olunmuş Examine vərəqi ilə yan-yana ölçü yoxlaması zamanı istinad.
    """
    return {
        "margin_side_mm": float(L_BASE["margin"]),
        "timing_track_mm": float(TIMING_TRACK_MM),
        "content_left_mm": float(content_left_mm()),
        "header_bar_mm": float(L_BASE["header_h"]),
        "footer_zone_mm": float(L_BASE["footer_h"]),
        "sep_identity_to_mcq_mm": float(L_BASE["sep_v"]),
        "fiducial_outer_r_mm": float(L_BASE["fiducial_outer_r_mm"]),
        "default_bubble_d_mm": float(L_BASE["bubble_d"]),
    }


def paper_size_mm(cfg: dict[str, Any]) -> tuple[float, float, str]:
    key = str(cfg.get("paper_size", "A4"))
    if key not in PAPERS:
        key = "A4"
    pw, ph = PAPERS[key]
    return pw / mm_u, ph / mm_u, key


def _audit_identity_kind(f: dict[str, Any]) -> str:
    """
    Audit üçün sahə növü — bəzi köhnə/istisna JSON-da `kind` çatışmır; `groups` quruluşundan təxmin et.
    """
    raw = f.get("kind")
    if isinstance(raw, str) and raw.strip():
        return raw.strip().lower()
    groups = f.get("groups")
    if isinstance(groups, list) and groups:
        g0 = groups[0]
        if isinstance(g0, dict):
            if "count" in g0:
                return "digit_groups"
            if "options" in g0:
                return "mcq_groups"
    if f.get("columns") is not None:
        return "vertical_letters"
    if f.get("rows") is not None and f.get("letters_count") is not None:
        return "horizontal_letters"
    return "?"


def _inflated_overlap(
    ax: float,
    ay: float,
    aw: float,
    ah: float,
    bx: float,
    by: float,
    bw: float,
    bh: float,
    pad: float,
) -> bool:
    ax1, ay1 = ax - pad, ay - pad
    aw1, ah1 = aw + 2.0 * pad, ah + 2.0 * pad
    bx1, by1 = bx - pad, by - pad
    bw1, bh1 = bw + 2.0 * pad, bh + 2.0 * pad
    return not (ax1 + aw1 <= bx1 or bx1 + bw1 <= ax1 or ay1 + ah1 <= by1 or by1 + bh1 <= ay1)


def _overlap_depth_mm(
    ax: float,
    ay: float,
    aw: float,
    ah: float,
    bx: float,
    by: float,
    bw: float,
    bh: float,
) -> float:
    ox = min(ax + aw, bx + bw) - max(ax, bx)
    oy = min(ay + ah, by + bh) - max(ay, by)
    if ox <= 0 or oy <= 0:
        return 0.0
    return min(ox, oy)


def _should_report_identity_overlap(
    b1: dict[str, Any],
    b2: dict[str, Any],
    pad: float,
) -> tuple[bool, float]:
    """
    Yalançı pozitivləri süzür:
    - şaquli stack (ad üstündə, kod aşağıda) — en kəsişsə belə OK;
    - eyni sətirdə yan-yana qruplar — kiçik en artığı (<1.2 mm) nəzərə alınmır;
    - şaquli hərf sütunu ilə alt sətirdəki rəqəm/seçim — yalnız əhəmiyyətli kəsişmə.
    """
    x1, y1, w1, h1 = float(b1["x"]), float(b1["y"]), float(b1["w"]), float(b1["h"])
    x2, y2, w2, h2 = float(b2["x"]), float(b2["y"]), float(b2["w"]), float(b2["h"])
    k1 = str(b1.get("kind") or "")
    k2 = str(b2.get("kind") or "")

    stack_slack = 0.75
    if y1 + h1 <= y2 + stack_slack or y2 + h2 <= y1 + stack_slack:
        return False, 0.0

    row_tol = 2.8
    if abs(y1 - y2) <= row_tol and abs(h1 - h2) <= 5.0:
        h_pad = 0.35
        if x1 + w1 + h_pad <= x2 or x2 + w2 + h_pad <= x1:
            return False, 0.0
        ox = min(x1 + w1, x2 + w2) - max(x1, x2)
        oy = min(y1 + h1, y2 + h2) - max(y1, y2)
        if oy <= 1.5 and ox <= 1.2:
            return False, 0.0

    # Alt sətir (rəqəm/seçim) yan sütunların alt boşluğu ilə toxunursa — yalnız dərin kəsişmə
    lower_kinds = frozenset({"digits", "digit_groups", "mcq", "mcq_groups"})
    upper_kinds = frozenset({"vertical_letters", "horizontal_letters"})
    for upper, lower, ku, kl in ((b1, b2, k1, k2), (b2, b1, k2, k1)):
        if ku not in upper_kinds or kl not in lower_kinds:
            continue
        ux, uy, uw, uh = float(upper["x"]), float(upper["y"]), float(upper["w"]), float(upper["h"])
        lx, ly, lw, lh = float(lower["x"]), float(lower["y"]), float(lower["w"]), float(lower["h"])
        if ly + 0.35 < uy + uh * 0.45:
            continue
        ox = min(ux + uw, lx + lw) - max(ux, lx)
        if ox <= 0:
            continue
        overlap_frac = ox / max(0.5, lw)
        oy = min(uy + uh, ly + lh) - max(uy, ly)
        if oy <= 0:
            continue
        if overlap_frac < 0.42 and oy < 3.5:
            return False, 0.0

    if not _inflated_overlap(x1, y1, w1, h1, x2, y2, w2, h2, pad):
        return False, 0.0

    depth = _overlap_depth_mm(x1, y1, w1, h1, x2, y2, w2, h2)
    if depth < 0.85:
        return False, depth
    return True, depth


def audit_answer_sheet_layout(cfg: dict[str, Any]) -> dict[str, Any]:
    """
    layout_warnings — operator üçün qısa mesajlar (az).

    Ölçü hesablamaları `effective_layout_config` (PDF generator-un
    `config_with_identity_matched_to_mcq` ilə eyni) cfg üzərində aparılır ki,
    PDF-də gerçəkdən çəkilən boyu görək; yalançı pozitivlər aradan qalxır.
    """
    warnings: list[str] = []
    pw_mm, ph_mm, paper_key = paper_size_mm(cfg)
    cfg = effective_layout_config(cfg, pw_mm, ph_mm)

    left_min = content_left_mm()
    right_max = pw_mm - float(L_BASE["margin"]) - SAFE_CONTENT_INSET_MM
    top_zone = identity_zone_top_mm()
    bottom_safe = (
        ph_mm
        - float(L_BASE["margin"])
        - float(L_BASE["footer_h"])
        - MIN_GRID_ABOVE_FOOTER_MM
        - SAFE_CONTENT_INSET_MM
    )

    q_count = max(1, int(cfg.get("question_count", 50)))
    cols = max(1, min(6, int(cfg.get("columns_count", 2))))
    layout_ff = cfg.get("layout_mode") == "freeform"
    mg0 = cfg.get("mcq_grid") or {}
    left_fit = float(mg0.get("left_mm", content_left_mm())) if layout_ff else content_left_mm()
    id_h = identity_height_mm(cfg)

    if bool(cfg.get("single_page_layout", True)):
        fit = max_questions_fit_below_identity(
            ph_mm, cols, id_h, cfg, pw_mm=pw_mm, left_mm=left_fit,
        )
        if fit < q_count:
            warnings.append(
                f"Bir səhifədə təxminən {fit} sual sığır; {q_count} sual üçün "
                "«Tək səhifə» seçimini söndürün və ya sütun/sual sayını azaldın.",
            )

    if cfg.get("layout_mode") == "freeform" and bool(cfg.get("identity_section", True)):
        fields = resolve_identity_fields(cfg)
        boxes: list[dict[str, Any]] = []
        default_y = top_zone + 3.0 + 7.0
        for f in fields:
            for box in identity_field_audit_boxes(
                f, cfg, left_min=left_min, default_y=default_y,
            ):
                x0 = float(box["x"])
                y0 = float(box["y"])
                w = float(box["w"])
                h = float(box["h"])
                tag = str(box.get("tag") or "?")
                boxes.append(box)
                if x0 < left_min - 0.25:
                    warnings.append(
                        f"«{identity_field_display_name(box)}» sol marginə çox yaxındır (x={x0:.1f} mm).",
                    )
                if x0 + w > right_max + 0.25:
                    warnings.append(
                        f"«{identity_field_display_name(box)}» sağ kənara daşır "
                        f"(x+en={x0 + w:.1f} mm, limit≈{right_max:.1f} mm).",
                    )
                if y0 + h > bottom_safe + 0.25:
                    warnings.append(
                        f"«{identity_field_display_name(box)}» footer zonasına daxil olur "
                        f"(alt={y0 + h:.1f} mm, limit≈{bottom_safe:.1f} mm).",
                    )
                if y0 < top_zone - 0.5:
                    warnings.append(
                        f"«{identity_field_display_name(box)}» magenta başlığın üstünə çıxa bilər (y={y0:.1f} mm).",
                    )

        pad = max(MIN_FREE_FORM_FIELD_GAP_MM, 0.8)
        seen_pair: set[tuple[str, str]] = set()
        for i, b1 in enumerate(boxes):
            for j in range(i + 1, len(boxes)):
                b2 = boxes[j]
                report, depth = _should_report_identity_overlap(b1, b2, pad)
                if not report:
                    continue
                t1 = str(b1.get("tag") or "?")
                t2 = str(b2.get("tag") or "?")
                a, b = (t1, t2) if t1 <= t2 else (t2, t1)
                if (a, b) in seen_pair:
                    continue
                seen_pair.add((a, b))
                n1 = identity_field_display_name(b1)
                n2 = identity_field_display_name(b2)
                warnings.append(
                    f"«{n1}» və «{n2}» üst-üstə düşür (≈{depth:.1f} mm). "
                    "Sahələri ayırın və ya «Avtomatik düzəlt» / PDF yaratmadan əvvəl mövqeləri yoxlayın.",
                )

        if boxes:
            # İki səhifəli PDF-də MCQ 2-ci səhifədədir; 1-ci səhifədəki şəxsiyyət üçün
            # `mcq_grid.top_mm` anchor müqayisəsi saxta xəbərdarlıq verirdi.
            if not answer_sheet_two_page_required(cfg, pw_mm, ph_mm):
                mcq_top = freeform_mcq_grid_top_anchor_mm(mg0, id_h, cfg)
                # mcq_groups / mcq sahələri cavab şəbəkəsinə yaxın ola bilər — anchor yalnız
                # ad, rəqəm, şaquli hərf blokları ilə müqayisə olunur.
                anchor_kinds = frozenset(
                    {
                        "vertical_letters",
                        "horizontal_letters",
                        "digits",
                        "digit_groups",
                        "note",
                        "declaration",
                    }
                )
                anchor_boxes = [
                    (float(b["x"]), float(b["y"]), float(b["w"]), float(b["h"]))
                    for b in boxes
                    if str(b.get("kind") or "") in anchor_kinds
                ]
                if anchor_boxes:
                    max_bottom = max(y + h for (x, y, w, h) in anchor_boxes)
                else:
                    max_bottom = max(float(b["y"]) + float(b["h"]) for b in boxes)
                sep_need = float(L_BASE["sep_v"]) * 0.85
                if max_bottom > mcq_top - sep_need:
                    warnings.append(
                        "Şəxsiyyət sahələri MCQ şəbəkəsi ilə kəsişə bilər — "
                        "«Cavablar» şəbəkəsini aşağı çəkin və ya sahələri yuxarı sıxın.",
                    )

    mcq_bottom = mcq_content_bottom_mm(cfg, pw_mm, ph_mm)
    if mcq_bottom is not None and mcq_bottom > bottom_safe + 0.15:
        q_count = max(1, int(cfg.get("question_count", 50)))
        cols = max(1, int(cfg.get("columns_count", 2)))
        per_col = math.ceil(q_count / cols)
        warnings.append(
            f"MCQ şəbəkəsi footer xəttinə çox yaxındır və ya daşır (alt≈{mcq_bottom:.1f}mm, "
            f"təhlükəsiz≤{bottom_safe:.1f}mm). "
            f"Sütun sayını artırın (hazırda {cols}, sütun başına ~{per_col} sual).",
        )

    chk = list(print_checklist(paper_key))
    two_page = answer_sheet_two_page_required(cfg, pw_mm, ph_mm)
    fs = pdf_font_embed_status()
    if not fs.get("ttf_normal_found"):
        warnings.append(
            "PDF şrifti Helvetica fallback — Azərbaycan hərfləri (ç, ə, ş, ğ, ı, ö, ü) "
            "düzgün çap olunmayacaq. Serverə DejaVu TTF quraşdırın (pdf_fonts / DEJAVU_FONT_DIR).",
        )
        chk.append(
            "Bloklayıcı: AZ latın TTF tapılmadı — PDF yayımlanmamalıdır.",
        )

    issues = [str(x).strip() for x in warnings if str(x).strip()]
    return {
        "paper": paper_key,
        "page_mm": [round(pw_mm, 2), round(ph_mm, 2)],
        "content_right_mm": round(right_max, 2),
        "safe_bottom_mm": round(bottom_safe, 2),
        "layout_warnings": warnings,
        "print_checklist": chk,
        "font_status": fs,
        "dim_layout_mm_reference": dim_layout_mm_reference(),
        "two_page_required": two_page,
        "effective_single_page_layout": not two_page,
        "publishable": len(issues) == 0,
    }


def layout_publishability_issues(audit: dict[str, Any]) -> list[str]:
    """Yayımlanmaz (PDF saxlanmamalı) layout xəbərdarlıqları — audit cavabından."""
    return [str(x).strip() for x in (audit.get("layout_warnings") or []) if str(x).strip()]


def verify_generated_pdf_matches_audit(pdf_bytes: bytes, audit: dict[str, Any]) -> list[str]:
    """
    PDF-in hər səhifəsinin MediaBox ölçüsü audit.page_mm ilə üst-üstə düşməlidir.
    Boş siyahı = OK; əks halda daxili uyğunsuzluq (çap axını təhlükəsiz dayandırılmalıdır).
    """
    import fitz

    exp = audit.get("page_mm")
    if not isinstance(exp, (list, tuple)) or len(exp) < 2:
        return []
    exp_w, exp_h = float(exp[0]), float(exp[1])
    issues: list[str] = []
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as err:  # noqa: BLE001
        return [f"PDF oxuna bilmədi: {err}"]
    try:
        for i in range(doc.page_count):
            rect = doc.load_page(i).rect
            w_mm = rect.width * 25.4 / 72.0
            h_mm = rect.height * 25.4 / 72.0
            if abs(w_mm - exp_w) > 0.12 or abs(h_mm - exp_h) > 0.12:
                issues.append(
                    f"Səhifə {i + 1}: PDF {w_mm:.2f}×{h_mm:.2f} mm, gözlənən {exp_w:.2f}×{exp_h:.2f} mm",
                )
    finally:
        doc.close()
    return issues
