"""FIN validation and masking helpers."""

from __future__ import annotations

import re

# Azerbaijan FIN: 7 alphanumeric characters (letters + digits)
_FIN_RE = re.compile(r"^[A-Za-z0-9]{7}$")


def normalize_fin(raw: str | None) -> str:
    if raw is None:
        raise ValueError("FIN kodu tələb olunur")
    fin = raw.strip().upper()
    if not _FIN_RE.match(fin):
        raise ValueError("FIN kodu 7 simvol olmalıdır (hərf və rəqəm)")
    return fin


def mask_fin(fin: str | None) -> str | None:
    if not fin:
        return None
    f = fin.strip().upper()
    if len(f) < 4:
        return "***"
    return f"{f[:2]}***{f[-2:]}"


def synthetic_email_for_fin(fin: str) -> str:
    return f"{fin.lower()}@fin.local"
