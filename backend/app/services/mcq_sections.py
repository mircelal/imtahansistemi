"""MCQ sual qrupları (fənn blokları) — başlıq + sual diapazonu."""

from __future__ import annotations

import copy
import math
from typing import Any

from app.services.dim_sheet_layout import (
    L_BASE,
    compute_mcquestion_blocks_with_gt,
    compute_mcquestion_tower_rows,
    mcq_options_horizontal,
    resolve_mcq_spacing,
)

MCQ_SECTION_TITLE_H_MM = 6.2
MCQ_SECTION_GAP_MM = 3.5


def resolve_mcq_sections(cfg: dict[str, Any]) -> list[dict[str, Any]]:
    """
    `mcq_sections` siyahısı və ya tək blok (1..question_count).
    Hər element: title, from_q, to_q, columns_count? (opsional).
    """
    raw = cfg.get("mcq_sections")
    if isinstance(raw, list) and raw:
        out: list[dict[str, Any]] = []
        for row in raw:
            if not isinstance(row, dict):
                continue
            try:
                fq = int(row.get("from_q", 0))
                tq = int(row.get("to_q", 0))
            except (TypeError, ValueError):
                continue
            if fq < 1 or tq < fq:
                continue
            title = str(row.get("title") or row.get("label") or "").strip() or f"Sual {fq}–{tq}"
            sec: dict[str, Any] = {"title": title, "from_q": fq, "to_q": tq}
            cc = row.get("columns_count")
            if cc is not None:
                try:
                    sec["columns_count"] = max(1, min(6, int(cc)))
                except (TypeError, ValueError):
                    pass
            for key in ("top_mm", "left_mm"):
                val = row.get(key)
                if val is not None:
                    try:
                        sec[key] = float(val)
                    except (TypeError, ValueError):
                        pass
            out.append(sec)
        if out:
            return out

    q_count = max(1, int(cfg.get("question_count", 50)))
    cols = max(1, min(6, int(cfg.get("columns_count", 2))))
    return [{"title": "", "from_q": 1, "to_q": q_count, "columns_count": cols}]


def enrich_mcq_sections_from_grading(cfg: dict[str, Any], grading_config: dict[str, Any] | None) -> dict[str, Any]:
    """İmtahan `grading_config.question_blocks` → `mcq_sections` (şablonda yoxdursa)."""
    out = copy.deepcopy(cfg)
    if out.get("mcq_sections"):
        return out
    if not grading_config or not isinstance(grading_config, dict):
        return out
    blocks = grading_config.get("question_blocks")
    if not isinstance(blocks, list) or not blocks:
        return out
    subjects_raw = grading_config.get("subjects") or []
    names: dict[str, str] = {}
    if isinstance(subjects_raw, list):
        for s in subjects_raw:
            if isinstance(s, dict):
                code = str(s.get("code", "")).strip()
                if code:
                    names[code] = str(s.get("name") or code).strip() or code
    sections: list[dict[str, Any]] = []
    default_cols = max(1, min(6, int(out.get("columns_count", 2))))
    for b in blocks:
        if not isinstance(b, dict):
            continue
        try:
            fq = int(b["from_q"])
            tq = int(b["to_q"])
        except (KeyError, TypeError, ValueError):
            continue
        sc = str(b.get("subject_code", "")).strip()
        title = names.get(sc, sc) if sc else f"Sual {fq}–{tq}"
        sec: dict[str, Any] = {"title": title, "from_q": fq, "to_q": tq}
        cc = b.get("columns_count")
        if cc is not None:
            try:
                sec["columns_count"] = max(1, min(6, int(cc)))
            except (TypeError, ValueError):
                sec["columns_count"] = default_cols
        else:
            sec["columns_count"] = default_cols
        sections.append(sec)
    if sections:
        out["mcq_sections"] = sections
    return out


def mcq_sections_use_stacked(cfg: dict[str, Any]) -> bool:
    """Çoxbölməli və ya başlıqlı fənn blokları — PDF/OMR/audit üçün eyni qayda."""
    secs = resolve_mcq_sections(cfg)
    return len(secs) > 1 or any(str(s.get("title") or "").strip() for s in secs)


def should_show_mcq_grid_label(cfg: dict[str, Any]) -> bool:
    """Fənn başlıqları olduqda ümumi CAVABLAR zolağını gizlət."""
    if not mcq_sections_use_stacked(cfg):
        return True
    return not any(str(s.get("title") or "").strip() for s in resolve_mcq_sections(cfg))


def _section_anchor_mm(
    sec: dict[str, Any],
    section_index: int,
    gt_anchor: float,
    left_anchor: float,
    stack_top_mm: float,
) -> tuple[float, float]:
    top_raw = sec.get("top_mm")
    left_raw = sec.get("left_mm")
    try:
        top_mm = float(top_raw) if top_raw is not None else None
    except (TypeError, ValueError):
        top_mm = None
    try:
        left_mm = float(left_raw) if left_raw is not None else None
    except (TypeError, ValueError):
        left_mm = None
    if top_mm is None:
        top_mm = float(gt_anchor) if section_index == 0 else float(stack_top_mm)
    if left_mm is None:
        left_mm = float(left_anchor)
    return top_mm, left_mm


def prepare_mcq_grid_blocks(
    pw_mm: float,
    ph_mm: float,
    cfg: dict[str, Any],
    gt_anchor: float,
    left_anchor: float,
) -> tuple[list[dict], float, float, float, float, float, float]:
    """
    PDF və OMR üçün eyni MCQ blok siyahısı.
    Qaytarır: (blocks, gt_first, gb, bubble_d, vgap, hgap, num_cell)
    """
    q_count = max(1, int(cfg.get("question_count", 50)))
    cols = max(1, min(6, int(cfg.get("columns_count", 2))))

    if mcq_sections_use_stacked(cfg):
        return compute_stacked_mcq_blocks(pw_mm, ph_mm, cfg, gt_anchor, left_anchor)

    bd_f, vg_f, hg_f, nc_f = resolve_mcq_spacing(
        ph_mm, cols, q_count, gt_anchor, cfg, pw_mm=pw_mm, left_mm=left_anchor,
    )
    if nc_f > 0:
        bl, gt_o, gb_o = compute_mcquestion_tower_rows(
            pw_mm, ph_mm, q_count, gt_anchor, left_anchor,
            bd_f, vg_f, hg_f, nc_f,
            max(2, min(5, int(cfg.get("options_per_question", 5)))),
            cfg,
        )
    else:
        bl, gt_o, gb_o = compute_mcquestion_blocks_with_gt(
            pw_mm, ph_mm, cols, q_count, gt_anchor,
            left_mm=left_anchor, bubble_d=bd_f, vgap=vg_f, hgap=hg_f,
        )
    return bl, gt_o, gb_o, bd_f, vg_f, hg_f, nc_f


def mcq_blocks_content_bottom_mm(blocks: list[dict], *, nc: float, options: int) -> float:
    """MCQ bloklarının (başlıq zolaqları istisna) ən aşağı kənarı (mm)."""
    mcq_blks = [b for b in blocks if b.get("layout") != "mcq_section_title" and b.get("qs")]
    if not mcq_blks:
        return 0.0
    return _section_bottom_mm(mcq_blks, nc=nc, options=options)


def _section_bottom_mm(blocks: list[dict], *, nc: float, options: int) -> float:
    bottom = 0.0
    for blk in blocks:
        if blk.get("layout") == "mcq_tower_row":
            row_y0 = float(blk["row_y0_mm"])
            nc_mm = float(blk["num_cell_mm"])
            pad_n = float(blk["pad_below_num"])
            bd = float(blk["bd"])
            opt_vg = float(blk["opt_vgap"])
            row_h = nc_mm + pad_n + (options - 1) * opt_vg + bd
            bottom = max(bottom, row_y0 + row_h)
        else:
            qs = blk.get("qs") or []
            if not qs:
                continue
            fby = float(blk["fby"])
            vg = float(blk.get("_vg", L_BASE["vgap"]))
            bd = float(blk.get("_bd", L_BASE["bubble_d"]))
            last = fby + (len(qs) - 1) * vg + bd / 2.0
            bottom = max(bottom, last)
    return bottom


def mcq_blocks_horizontal_span_mm(blocks: list[dict], left_anchor: float) -> float:
    """Fənn blokundakı MCQ sütun/zolaqların üfüqi eni (mm) — başlıq zolağı bununla məhdudlaşır."""
    right = float(left_anchor)
    for b in blocks:
        if b.get("layout") == "mcq_tower_row":
            band_w = len(b.get("qs") or []) * float(b.get("strip_pitch_mm", 0))
            right = max(right, float(b.get("row_left_mm", left_anchor)) + band_w)
        elif b.get("qs"):
            col_x = float(b.get("col_x", left_anchor))
            col_w = float(b.get("col_w", 0))
            right = max(right, col_x + col_w)
    return max(0.0, right - float(left_anchor))


def mcq_section_title_width_mm(
    title: str,
    section_blocks: list[dict],
    left_anchor: float,
    pw_mm: float,
) -> float:
    """Başlıq zolağı: məzmun eni + mətn; tam səhifə eni yalnız geniş bloklarda."""
    span = mcq_blocks_horizontal_span_mm(section_blocks, left_anchor)
    text_w = max(18.0, 4.0 + len(str(title or "").strip()) * 1.65)
    page_w = max(40.0, pw_mm - float(left_anchor) - L_BASE["margin"])
    return min(page_w, max(18.0, text_w, span + 2.0))


def mcq_grid_handle_width_mm(
    label: str,
    blocks: list[dict],
    left_anchor: float,
    pw_mm: float,
    *,
    region_width_mm: float = 0.0,
) -> float:
    """Cavab şəbəkəsi üst başlığının eni — dizayner `mcqGridHandleWidthMm` ilə eyni."""
    data_blocks = [b for b in blocks if b.get("layout") != "mcq_section_title"]
    span = mcq_blocks_horizontal_span_mm(data_blocks, left_anchor) if data_blocks else float(region_width_mm)
    text = str(label or "CAVABLAR").strip() or "CAVABLAR"
    text_w = max(18.0, 4.0 + len(text) * 1.65)
    page_w = max(40.0, pw_mm - float(left_anchor) - L_BASE["margin"])
    floor_w = max(18.0, text_w, span + 2.0)
    if region_width_mm > 0:
        floor_w = max(floor_w, min(float(region_width_mm) + 1.5, page_w))
    return min(page_w, floor_w)


def compute_stacked_mcq_blocks(
    pw_mm: float,
    ph_mm: float,
    cfg: dict[str, Any],
    gt_anchor: float,
    left_anchor: float,
) -> tuple[list[dict], float, float, float, float, float, float]:
    """
    Bütün fənn bloklarını vertikal yığır.
    Qaytarır: (blocks, gt_first, gb, bubble_d, vgap, hgap, num_cell)
    """
    sections = resolve_mcq_sections(cfg)
    options = max(2, min(5, int(cfg.get("options_per_question", 5))))
    default_cols = max(1, min(6, int(cfg.get("columns_count", 2))))
    gb = ph_mm - L_BASE["margin"] - L_BASE["footer_h"]

    all_blocks: list[dict] = []
    gt_cursor = float(gt_anchor)
    bd_f = vg_f = hg_f = 0.0
    nc_f = 0.0

    for si, sec in enumerate(sections):
        fq = int(sec["from_q"])
        tq = int(sec["to_q"])
        n = max(0, tq - fq + 1)
        if n <= 0:
            continue
        cols = int(sec.get("columns_count") or default_cols)
        title = str(sec.get("title") or "").strip()

        sec_top, sec_left = _section_anchor_mm(sec, si, gt_anchor, left_anchor, gt_cursor)
        block_gt = float(sec_top)
        if title:
            block_gt = float(sec_top) + MCQ_SECTION_TITLE_H_MM + L_BASE["grid_top_pad"] * 0.35

        bd_f, vg_f, hg_f, nc_f = resolve_mcq_spacing(
            ph_mm, cols, n, block_gt, cfg, pw_mm=pw_mm, left_mm=sec_left,
        )

        if nc_f > 0:
            bl, _, _ = compute_mcquestion_tower_rows(
                pw_mm, ph_mm, n, block_gt, sec_left,
                bd_f, vg_f, hg_f, nc_f, options, cfg,
            )
            for blk in bl:
                blk["qs"] = [fq + q - 1 for q in blk["qs"]]
                if title:
                    blk["section_title"] = title
        else:
            bl, _, _ = compute_mcquestion_blocks_with_gt(
                pw_mm, ph_mm, cols, n, block_gt,
                left_mm=sec_left, bubble_d=bd_f, vgap=vg_f, hgap=hg_f,
            )
            for blk in bl:
                blk["qs"] = [fq + q - 1 for q in blk["qs"]]
                if title:
                    blk["section_title"] = title

        if title:
            all_blocks.append({
                "layout": "mcq_section_title",
                "title": title,
                "y_mm": sec_top,
                "left_mm": sec_left,
                "width_mm": mcq_section_title_width_mm(title, bl, sec_left, pw_mm),
                "section_index": si,
            })

        all_blocks.extend(bl)
        sec_bottom = _section_bottom_mm(bl, nc=nc_f, options=options)
        if sec_bottom > gt_cursor:
            gt_cursor = sec_bottom + MCQ_SECTION_GAP_MM

    return all_blocks, float(gt_anchor), gb, bd_f, vg_f, hg_f, nc_f
