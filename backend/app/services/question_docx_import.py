"""Word (.docx) sual idxalı — nömrələnmiş suallar + A/B/C/D variantları."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from io import BytesIO
from typing import Any

from docx import Document

_Q_START = re.compile(
    r"^\s*(?:sual\s*)?(\d{1,3})\s*[.)\-–:]\s*(.*)$",
    re.IGNORECASE,
)
_OPT = re.compile(
    r"^\s*([A-Ea-eА-Еа-е]|[1-5])\s*[.)\-–:]\s*(.+)$",
)

# Cyrillic lookalikes → Latin A–E
_CYR_MAP = str.maketrans({
    "А": "A", "а": "A",
    "В": "B", "в": "B",  # often used for B
    "Б": "B", "б": "B",
    "С": "C", "с": "C",
    "Д": "D", "д": "D",
    "Е": "E", "е": "E",
})


@dataclass
class ParsedDocxQuestion:
    order_index: int
    stem: str
    options: list[str] = field(default_factory=list)
    qtype: str = "mcq"


def _norm_opt_key(raw: str) -> str:
    s = raw.strip().translate(_CYR_MAP).upper()
    if s.isdigit():
        # 1→A, 2→B...
        n = int(s)
        if 1 <= n <= 5:
            return chr(ord("A") + n - 1)
    if len(s) == 1 and "A" <= s <= "E":
        return s
    return s[:1].upper() if s else "A"


def _paragraph_texts(data: bytes) -> list[str]:
    doc = Document(BytesIO(data))
    lines: list[str] = []
    for p in doc.paragraphs:
        t = (p.text or "").replace("\xa0", " ").strip()
        if t:
            lines.append(t)
    # Also pull simple table cells (common in Word exports)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                t = (cell.text or "").replace("\xa0", " ").strip()
                if t and t not in lines:
                    # split multi-line cells
                    for part in t.splitlines():
                        pt = part.strip()
                        if pt:
                            lines.append(pt)
    return lines


def parse_questions_from_docx(data: bytes) -> list[ParsedDocxQuestion]:
    """
    Gözlənilən format (nümunə):

        1. Sual mətni buradadır
        A) Variant bir
        B) Variant iki
        C) Variant üç
        D) Variant dörd

        2) Növbəti sual...
        A. ...
    """
    lines = _paragraph_texts(data)
    if not lines:
        return []

    questions: list[ParsedDocxQuestion] = []
    current: ParsedDocxQuestion | None = None
    stem_parts: list[str] = []

    def flush() -> None:
        nonlocal current, stem_parts
        if current is None:
            return
        stem = " ".join(stem_parts).strip() or current.stem
        current.stem = stem
        if not current.options:
            current.qtype = "essay"
        questions.append(current)
        current = None
        stem_parts = []

    for line in lines:
        qm = _Q_START.match(line)
        if qm:
            flush()
            order_index = int(qm.group(1))
            rest = (qm.group(2) or "").strip()
            current = ParsedDocxQuestion(order_index=order_index, stem=rest)
            stem_parts = [rest] if rest else []
            continue

        om = _OPT.match(line)
        if om and current is not None:
            # first option closes stem accumulation
            if stem_parts and not current.stem:
                current.stem = " ".join(stem_parts).strip()
            opt_text = (om.group(2) or "").strip()
            if opt_text:
                current.options.append(opt_text)
            continue

        if current is not None and not current.options:
            stem_parts.append(line)
        elif current is not None and current.options:
            # continuation of last option
            current.options[-1] = f"{current.options[-1]} {line}".strip()

    flush()

    # Deduplicate / sort by order_index; keep first occurrence if dup
    seen: set[int] = set()
    out: list[ParsedDocxQuestion] = []
    for q in sorted(questions, key=lambda x: x.order_index):
        if q.order_index in seen or not q.stem.strip():
            continue
        seen.add(q.order_index)
        out.append(q)
    return out


def parsed_to_bank_options(q: ParsedDocxQuestion) -> dict[str, Any] | None:
    if q.qtype == "essay" or not q.options:
        return {"max_lines": 8, "rubric": ""}
    keys = "ABCDE"
    choices = []
    for i, text in enumerate(q.options[:5]):
        key = keys[i]
        safe = text.replace("<", "&lt;").replace(">", "&gt;")
        choices.append({"key": key, "html": f"<p>{safe}</p>"})
    if len(choices) < 2:
        return None
    return {"choices": choices, "correct_key": choices[0]["key"]}
