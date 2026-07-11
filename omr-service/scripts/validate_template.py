"""Validate OMR template JSON against OMRChecker schema (debug)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft7Validator

OMRCHECKER_ROOT = Path("/opt/OMRChecker")
sys.path.insert(0, str(OMRCHECKER_ROOT))

from src.schemas import SCHEMA_JSONS  # noqa: E402


def main() -> None:
    raw = sys.stdin.read()
    tpl = json.loads(raw)
    v = Draft7Validator(SCHEMA_JSONS["template"])
    errors = sorted(v.iter_errors(tpl), key=lambda e: list(e.path))
    if not errors:
        print("OK")
        return
    for e in errors:
        path = ".".join(str(p) for p in e.path) or "$root"
        print(f"{path}\t{e.validator}\t{e.message}")


if __name__ == "__main__":
    main()
