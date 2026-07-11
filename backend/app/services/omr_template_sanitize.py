"""OMRChecker template.json — yalnız mühərrikin qəbul etdiyi açar sözlər."""

from __future__ import annotations

from typing import Any


def sanitize_field_block(block: dict[str, Any]) -> dict[str, Any]:
    """fieldType və ya bubbleValues+direction tələb olunur."""
    blk = dict(block)
    if "fieldType" not in blk and "bubbleValues" in blk and "direction" not in blk:
        n = len(blk.get("bubbleValues") or [])
        if n in (4, 5):
            blk["fieldType"] = f"QTYPE_MCQ{n}"
        else:
            blk["direction"] = "horizontal"
    return blk


def sanitize_omr_template_for_omrchecker(tpl: dict[str, Any]) -> dict[str, Any]:
    drop = {
        "meta",
        "_processor",
        "two_page_pdf",
        "omr_two_page_stitched",
        "identity_fieldBlocks",
        "identity_outputColumns",
        "bubbleValues",
        "options",
    }
    out = {k: v for k, v in tpl.items() if k not in drop}
    raw_blocks = out.get("fieldBlocks")
    if isinstance(raw_blocks, dict):
        out["fieldBlocks"] = {k: sanitize_field_block(v) for k, v in raw_blocks.items()}
    return out


def assert_omrchecker_field_blocks_valid(tpl: dict[str, Any]) -> None:
    """Pytest: hər fieldBlock OMRChecker oneOf qaydasına uyğundur."""
    for name, block in (tpl.get("fieldBlocks") or {}).items():
        has_type = "fieldType" in block
        has_custom = "bubbleValues" in block and "direction" in block
        assert has_type or has_custom, f"{name}: fieldType və ya bubbleValues+direction lazımdır"
