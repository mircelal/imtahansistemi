"""
Açıq sual (grid_in / essay) cavab kartı layout + OMR fieldBlocks.

Config açarı `open_blocks` (siyahı):
  {
    "kind": "grid_in" | "essay",
    "question_number": 46,
    "x_mm": 20, "y_mm": 120,   # səhifə yuxarısından (PDF identity ilə eyni)
    "answer_length": 3,         # grid_in
    "alphabet": "digits" | "digits_letters_az",
    "box_w_mm": 40, "box_h_mm": 55,  # essay
    "max_lines": 8,                  # essay
    "page": 1,                       # 1-based PDF səhifəsi (A3 fold: panel id)
    "panel": 1,                      # 1..4 A3 duplex fold paneli
  }
"""
from __future__ import annotations

from typing import Any

from app.services.bank_question_options import (
    GRID_IN_ALPHABET_DIGITS,
    GRID_IN_ALPHABET_DIGITS_LETTERS_AZ,
    grid_in_bubble_values,
)
from app.services.dim_sheet_layout import L_BASE, PX_PER_MM, content_left_mm, mm_to_px

# Grid-in balon ölçüləri (identity digit-ə yaxın)
GRID_IN_BUBBLE_D_MM = 4.0
GRID_IN_VGAP_MM = 4.15
GRID_IN_COL_GAP_MM = 1.8
GRID_IN_HANDWRITE_H_MM = 5.5
GRID_IN_LABEL_H_MM = 4.5
GRID_IN_PAD_MM = 1.5


def mm_to_px_f(v: float) -> float:
    return float(v) * PX_PER_MM


def resolve_open_blocks(cfg: dict[str, Any] | None) -> list[dict[str, Any]]:
    """`open_blocks` siyahısını normallaşdır."""
    cfg = cfg or {}
    raw = cfg.get("open_blocks")
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        kind = str(row.get("kind") or "").strip().lower()
        if kind not in ("grid_in", "essay"):
            continue
        try:
            qn = int(row.get("question_number") or row.get("q") or 0)
        except (TypeError, ValueError):
            continue
        if qn < 1:
            continue
        try:
            x_mm = float(row.get("x_mm", content_left_mm()))
            y_mm = float(row.get("y_mm", 80.0))
        except (TypeError, ValueError):
            continue
        block: dict[str, Any] = {
            "kind": kind,
            "question_number": qn,
            "x_mm": x_mm,
            "y_mm": y_mm,
            "page": max(1, int(row.get("page") or 1)),
            "panel": max(1, min(4, int(row.get("panel") or 1))),
        }
        if kind == "grid_in":
            try:
                length = int(row.get("answer_length") or 3)
            except (TypeError, ValueError):
                length = 3
            length = max(1, min(12, length))
            alphabet = str(row.get("alphabet") or GRID_IN_ALPHABET_DIGITS).strip().lower()
            if alphabet not in (GRID_IN_ALPHABET_DIGITS, GRID_IN_ALPHABET_DIGITS_LETTERS_AZ):
                alphabet = GRID_IN_ALPHABET_DIGITS
            block["answer_length"] = length
            block["alphabet"] = alphabet
            block["bubble_values"] = grid_in_bubble_values(alphabet)
        else:
            try:
                box_w = float(row.get("box_w_mm") or 55.0)
                box_h = float(row.get("box_h_mm") or 45.0)
                max_lines = int(row.get("max_lines") or 8)
            except (TypeError, ValueError):
                box_w, box_h, max_lines = 55.0, 45.0, 8
            block["box_w_mm"] = max(20.0, min(200.0, box_w))
            block["box_h_mm"] = max(15.0, min(250.0, box_h))
            block["max_lines"] = max(1, min(40, max_lines))
        out.append(block)
    return out


def grid_in_block_size_mm(block: dict[str, Any]) -> tuple[float, float]:
    """(width, height) mm — çərçivə daxil."""
    n_cols = int(block.get("answer_length") or 3)
    values = block.get("bubble_values") or list("0123456789")
    n_vals = len(values)
    dd = GRID_IN_BUBBLE_D_MM
    pitch = dd + GRID_IN_COL_GAP_MM
    w = GRID_IN_PAD_MM * 2 + n_cols * pitch + 2.0
    h_bubbles = (n_vals - 1) * GRID_IN_VGAP_MM + dd
    h = GRID_IN_LABEL_H_MM + GRID_IN_HANDWRITE_H_MM + 1.0 + h_bubbles + GRID_IN_PAD_MM
    return w, h


def essay_block_size_mm(block: dict[str, Any]) -> tuple[float, float]:
    return float(block.get("box_w_mm") or 55.0), float(block.get("box_h_mm") or 45.0)


def _center_to_origin_tl(cx_mm: float, cy_mm: float, d_mm: float) -> tuple[float, float]:
    """Balon mərkəzi → OMRChecker origin (sol-üst künc)."""
    return cx_mm - d_mm / 2.0, cy_mm - d_mm / 2.0


def build_open_omr_field_blocks(
    cfg: dict[str, Any] | None,
    *,
    y_shift_mm: float = 0.0,
    page_filter: int | None = None,
    panel_filter: int | None = None,
) -> tuple[dict[str, Any], list[str]]:
    """
    Grid-in üçün OMR fieldBlocks.
    Essay OMR-ə daxil deyil (yalnız crop).
    Hər sütun ayrı etiket: q{n}_d1 … — sonra compose_grid_in_from_detected birləşdirir.
    """
    field_blocks: dict[str, Any] = {}
    out_cols: list[str] = []
    fb_i = 0
    dd = GRID_IN_BUBBLE_D_MM
    dvg = GRID_IN_VGAP_MM
    pitch = dd + GRID_IN_COL_GAP_MM

    for block in resolve_open_blocks(cfg):
        if block["kind"] != "grid_in":
            continue
        if page_filter is not None and int(block.get("page") or 1) != page_filter:
            continue
        if panel_filter is not None and int(block.get("panel") or 1) != panel_filter:
            continue

        qn = int(block["question_number"])
        n_cols = int(block["answer_length"])
        values = list(block.get("bubble_values") or list("0123456789"))
        x0 = float(block["x_mm"]) + GRID_IN_PAD_MM
        # Handwrite + label üstündən sonra bubble top
        y_bubbles = float(block["y_mm"]) + GRID_IN_LABEL_H_MM + GRID_IN_HANDWRITE_H_MM + 1.0 + y_shift_mm
        col0_cx = x0 + pitch / 2.0
        cy0 = y_bubbles + dd / 2.0
        labels = [f"q{qn}_d{j + 1}" for j in range(n_cols)]
        ox_mm, oy_mm = _center_to_origin_tl(col0_cx, cy0, dd)

        if values == list("0123456789"):
            field_blocks[f"GRIDIN_{qn}_{fb_i}"] = {
                "fieldType": "QTYPE_INT",
                "fieldLabels": labels,
                "origin": [mm_to_px(ox_mm), mm_to_px(oy_mm)],
                "bubblesGap": mm_to_px(dvg),
                "labelsGap": mm_to_px(pitch),
            }
        else:
            # Hər sütun ayrı şaquli custom bubble sütunu
            for j, lab in enumerate(labels):
                cx = col0_cx + j * pitch
                ox_j, oy_j = _center_to_origin_tl(cx, cy0, dd)
                field_blocks[f"GRIDIN_{qn}_c{j}_{fb_i}"] = {
                    "bubbleValues": values,
                    "direction": "vertical",
                    "fieldLabels": [lab],
                    "origin": [mm_to_px(ox_j), mm_to_px(oy_j)],
                    "bubblesGap": mm_to_px(dvg),
                    "labelsGap": mm_to_px(0),
                }
        out_cols.extend(labels)
        fb_i += 1

    return field_blocks, out_cols


def compose_grid_in_from_detected(
    detected: dict[str, Any] | None,
    cfg: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    `q46_d1`+`q46_d2`+… → `Q46` / `q46` çoxsimvollu cavab.
    Mövcud MCQ `Q{n}` açarlarına toxunmur (yalnız grid_in blokları üçün).
    """
    det = dict(detected or {})
    blocks = resolve_open_blocks(cfg) if cfg else []
    grid_qnums: set[int] = set()
    lengths: dict[int, int] = {}
    if blocks:
        for b in blocks:
            if b["kind"] == "grid_in":
                qn = int(b["question_number"])
                grid_qnums.add(qn)
                lengths[qn] = int(b.get("answer_length") or 3)
    else:
        # Config yoxdursa — `qN_dK` açarlarından təxmin et
        import re

        for k in det:
            m = re.match(r"^q(\d+)_d(\d+)$", str(k), re.IGNORECASE)
            if m:
                qn = int(m.group(1))
                grid_qnums.add(qn)
                lengths[qn] = max(lengths.get(qn, 0), int(m.group(2)))

    for qn in sorted(grid_qnums):
        n = lengths.get(qn, 3)
        chars: list[str] = []
        for j in range(1, n + 1):
            v = str(det.get(f"q{qn}_d{j}") or det.get(f"Q{qn}_d{j}") or "").strip().upper()
            chars.append(v)
        joined = "".join(chars)
        # Trailing empty columns silinməsin — leading blanks saxlanılır (DİM 042)
        det[f"Q{qn}"] = joined
        det[f"q{qn}"] = joined
    return det


def essay_crop_rects_mm(
    cfg: dict[str, Any] | None,
    *,
    page_filter: int | None = None,
    panel_filter: int | None = None,
) -> list[dict[str, Any]]:
    """Essay bölgələri — skan crop üçün {question_number, x_mm, y_mm, w_mm, h_mm, page, panel}."""
    out: list[dict[str, Any]] = []
    for block in resolve_open_blocks(cfg):
        if block["kind"] != "essay":
            continue
        if page_filter is not None and int(block.get("page") or 1) != page_filter:
            continue
        if panel_filter is not None and int(block.get("panel") or 1) != panel_filter:
            continue
        w, h = essay_block_size_mm(block)
        out.append(
            {
                "question_number": int(block["question_number"]),
                "x_mm": float(block["x_mm"]),
                "y_mm": float(block["y_mm"]),
                "w_mm": w,
                "h_mm": h,
                "page": int(block.get("page") or 1),
                "panel": int(block.get("panel") or 1),
            }
        )
    return out


def open_blocks_from_questions(
    questions: list[Any],
    *,
    start_x_mm: float | None = None,
    start_y_mm: float = 120.0,
    gap_mm: float = 4.0,
    max_row_w_mm: float = 180.0,
) -> list[dict[str, Any]]:
    """
    Exam Question siyahısından avtomatik open_blocks düzümü (sadə sol→sağ, yuxarı→aşağı).
    Yalnız grid_in və essay qtype-ları.
    """
    from app.models.entities import QuestionType

    x0 = float(start_x_mm if start_x_mm is not None else content_left_mm())
    x = x0
    y = float(start_y_mm)
    row_h = 0.0
    blocks: list[dict[str, Any]] = []

    for q in questions:
        qt = q.qtype if hasattr(q, "qtype") else None
        if isinstance(qt, QuestionType):
            kind_map = {QuestionType.GRID_IN: "grid_in", QuestionType.ESSAY: "essay"}
            kind = kind_map.get(qt)
        else:
            raw = str(qt or "").strip().lower()
            kind = "grid_in" if raw in ("grid_in", "grid-in") else ("essay" if raw == "essay" else None)
        if not kind:
            continue
        opts = q.options if isinstance(getattr(q, "options", None), dict) else {}
        qn = int(getattr(q, "order_index", 0) or 0)
        if qn < 1:
            continue
        if kind == "grid_in":
            blk = {
                "kind": "grid_in",
                "question_number": qn,
                "x_mm": x,
                "y_mm": y,
                "answer_length": int(opts.get("answer_length") or 3),
                "alphabet": str(opts.get("alphabet") or GRID_IN_ALPHABET_DIGITS),
                "page": 1,
                "panel": 1,
            }
            bw, bh = grid_in_block_size_mm(blk)
        else:
            max_lines = int(opts.get("max_lines") or 8)
            bh = max(30.0, min(120.0, 8.0 + max_lines * 5.5))
            bw = 60.0
            blk = {
                "kind": "essay",
                "question_number": qn,
                "x_mm": x,
                "y_mm": y,
                "box_w_mm": bw,
                "box_h_mm": bh,
                "max_lines": max_lines,
                "page": 1,
                "panel": 1,
            }
        if x > x0 and x + bw > x0 + max_row_w_mm:
            x = x0
            y += row_h + gap_mm
            row_h = 0.0
            blk["x_mm"] = x
            blk["y_mm"] = y
        blocks.append(blk)
        x += bw + gap_mm
        row_h = max(row_h, bh)
    return blocks
