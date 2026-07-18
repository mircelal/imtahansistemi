"""
Şagird kodunun OMR cavabından çıxarılması və kurs üzrə DB ilə uyğunlaşdırılması.

Konvensiya: `identity_fields` içində `digit_groups` qrupu `id: "student_code"`, `count: 6`
→ sütunlar `id_student_code1` … `id_student_code6`.
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.dim_identity import identity_enabled, resolve_identity_fields

_STUDENT_DIGIT_GROUP: dict[str, Any] = {
    "kind": "digit_groups",
    "groups": [{"id": "student_code", "label": "Şagird kodu (6 rəqəm)", "count": 6}],
}


def _student_digit_group_standalone() -> dict[str, Any]:
    """Yalnız rəqəm bloku əlavə olunanda — audit/PDF ilə eyni default mm (freeform)."""
    from app.services.dim_sheet_layout import content_left_mm, identity_zone_top_mm

    row = dict(_STUDENT_DIGIT_GROUP)
    row["compact"] = True
    row["x_mm"] = float(content_left_mm())
    row["y_mm"] = float(identity_zone_top_mm() + 10.0)
    return row


def _field_has_six_digit_student_code(f: dict[str, Any]) -> bool:
    kind = f.get("kind")
    if kind == "digit_groups":
        for g in f.get("groups") or []:
            if str(g.get("id", "")) == "student_code" and int(g.get("count", 0)) == 6:
                return True
    elif kind == "digits":
        if str(f.get("id", "")) == "student_code" and int(f.get("count", 0)) == 6:
            return True
    return False


def _config_has_student_code(fields: list[Any]) -> bool:
    for f in fields:
        if isinstance(f, dict) and _field_has_six_digit_student_code(f):
            return True
    return False


def merge_student_identity_into_config(config: dict[str, Any]) -> dict[str, Any]:
    """
    Cavab kartı yaradılarkən: şəxsiyyət aktivdirsə və `student_code` qrupu yoxdursa,
    6 rəqəmli kod bloku əlavə olunur (köhnə şablonlar toxunulmur).
    """
    cfg = dict(config)
    if not identity_enabled(cfg):
        return cfg
    raw = cfg.get("identity_fields")
    if raw is not None and isinstance(raw, list) and len(raw) == 0:
        return cfg
    if isinstance(raw, list) and raw:
        if _config_has_student_code(raw):
            return cfg
        for f in raw:
            if f.get("kind") != "digit_groups":
                continue
            for g in f.get("groups") or []:
                if str(g.get("id", "")) == "student_code":
                    return cfg
        # Artıq digit_groups varsa — ayrıca blok əlavə etməyin (default x/y ilə üst-üstə düşərdi);
        # şagird kodunu ilk rəqəm qrupunun əvvəlinə əlavə et.
        for i, f in enumerate(raw):
            if not isinstance(f, dict) or f.get("kind") != "digit_groups":
                continue
            groups = list(f.get("groups") or [])
            ins = {"id": "student_code", "label": "Şagird kodu (6 rəqəm)", "count": 6}
            merged_field = dict(f)
            merged_field["groups"] = [ins] + groups
            new_raw = [dict(x) if isinstance(x, dict) else x for x in raw]
            new_raw[i] = merged_field
            cfg["identity_fields"] = new_raw
            return cfg
        cfg["identity_fields"] = [_student_digit_group_standalone()] + [
            dict(x) if isinstance(x, dict) else x for x in raw
        ]
        return cfg
    from app.services.dim_identity import default_identity_fields

    base = default_identity_fields(cfg)
    cfg["identity_fields"] = [_student_digit_group_standalone()] + base
    return cfg


def _digits_only(v: Any) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    if not s:
        return ""
    if re.match(r"^\d$", s):
        return s
    return ""


def extract_student_code_from_detected(detected: dict[str, Any], template_config: dict[str, Any] | None) -> str | None:
    """
    Tam 6 rəqəmli kod və ya None (şablon tələb etmir / məlumat natamamdır).
    """
    if not template_config:
        return None
    fields = resolve_identity_fields(dict(template_config))
    group_id: str | None = None
    count = 0
    for f in fields:
        if f.get("kind") == "digit_groups":
            for g in f.get("groups") or []:
                gid = str(g.get("id", ""))
                if gid == "student_code":
                    group_id = "student_code"
                    count = int(g.get("count", 6))
                    break
        elif f.get("kind") == "digits":
            gid = str(f.get("id", ""))
            if gid == "student_code":
                group_id = "student_code"
                count = int(f.get("count", 6))
        if group_id:
            break
    if not group_id or count != 6:
        return None
    parts: list[str] = []
    for j in range(1, 7):
        key = f"id_{group_id}{j}"
        d = _digits_only(detected.get(key))
        if not d:
            return None
        parts.append(d)
    return "".join(parts)


def resolve_student_id_from_scan(
    db: Any,
    exam: Any,
    answers: dict[str, Any],
    template_config: dict[str, Any] | None,
) -> tuple[int | None, str | None]:
    """
    Sinxron SQLAlchemy sessiyası ilə şagird ID və ya (None, səbəb_kodu).
    """
    from app.models.entities import Student

    tc = dict(template_config or {})
    if not template_expects_student_code(tc):
        return None, None
    code = extract_student_code_from_detected(answers, tc)
    if code is None:
        return None, "student_code_incomplete"
    if exam.course_id is None:
        return None, "exam_has_no_course"
    st = db.scalar(
        select(Student).where(Student.course_id == exam.course_id, Student.student_number == code)
    )
    if st is None:
        return None, "student_not_found"
    return int(st.id), None


async def async_resolve_student_id_from_scan(
    db: AsyncSession,
    exam: Any,
    answers: dict[str, Any],
    template_config: dict[str, Any] | None,
) -> tuple[int | None, str | None]:
    from app.models.entities import Student

    tc = dict(template_config or {})
    if not template_expects_student_code(tc):
        return None, None
    code = extract_student_code_from_detected(answers, tc)
    if code is None:
        return None, "student_code_incomplete"
    if exam.course_id is None:
        return None, "exam_has_no_course"
    st = await db.scalar(
        select(Student).where(Student.course_id == exam.course_id, Student.student_number == code)
    )
    if st is None:
        return None, "student_not_found"
    return int(st.id), None


def template_expects_student_code(template_config: dict[str, Any] | None) -> bool:
    if not template_config:
        return False
    fields = resolve_identity_fields(dict(template_config))
    for f in fields:
        if _field_has_six_digit_student_code(f):
            return True
    return False
