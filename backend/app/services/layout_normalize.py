"""
Freeform şəxsiyyət sahələri üçün avtomatik «mühəndis müdaxiləsi».

İstifadəçi səhv mövqelər versə belə, PDF/audit öncəsi:
- sağ/sol məzmun sərhədlərinə sıxışdırma;
- digit_groups çox enliyə — compact + iki sətir sıxışdırması;
- sahə kəsişmələri — daha «mobil» sahəni aşağı sürüşdürmə (məs. mcq_groups ad/sn/fn-dən aşağı);
- MCQ şəbəkəsinin yuxarısı şəxsiyyət zonasına dəymirsə — top_mm artırılır;
- `apply_layout_publish_guards`: bir səhifəyə sığmırsa və ya footerə daşma varsa `single_page_layout` avtomatik söndürülür.
"""
from __future__ import annotations

import copy
from typing import Any

from app.services.dim_identity import _field_height_mm, _field_width_mm
from app.services.dim_sheet_layout import (
    L_BASE,
    answer_sheet_two_page_required,
    content_left_mm,
    effective_layout_config,
    freeform_mcq_grid_top_anchor_max_mm,
    freeform_mcq_grid_top_anchor_mm,
    identity_zone_top_mm,
    mcq_content_bottom_mm,
    mcq_options_horizontal,
)
from app.services.layout_audit import paper_size_mm
from app.services.sheet_layout_spec import (
    MIN_FREE_FORM_FIELD_GAP_MM,
    MIN_GRID_ABOVE_FOOTER_MM,
    MIN_IDENTITY_STACK_GAP_MM,
    SAFE_CONTENT_INSET_MM,
)


def _identity_height_mm_for_layout(cfg: dict[str, Any]) -> float:
    """
    Normalize daxilində `identity_height_mm` əvəzi: `effective_layout_config`
    (PDF ilə eyni) cfg üzərində hesablayır. Sahə x/y mutasiyaları nəzərə
    alındıqdan sonra mcq_grid anchor üçün düzgün ölçü qaytarır.
    """
    from app.services.dim_identity import identity_height_mm_from_fields

    eff = effective_layout_config(cfg)
    return float(identity_height_mm_from_fields(eff))


def _mobility(kind: str | None) -> int:
    """Daha böyük = kəsişmədə daha tez yer dəyişir (ad/soyad tipli sahələr sabit qalır)."""
    order = (
        "vertical_letters",
        "digit_groups",
        "digits",
        "horizontal_letters",
        "mcq_groups",
        "mcq",
        "note",
        "declaration",
    )
    k = str(kind or "")
    try:
        return order.index(k)
    except ValueError:
        return 50


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


def _tighten_digit_groups_for_width(
    f: dict[str, Any],
    cfg: dict[str, Any],
    span_x: float,
    field_x: float,
    right_max: float,
) -> None:
    if f.get("kind") != "digit_groups":
        return
    w = _field_width_mm(f, cfg)
    if field_x + w <= right_max - 0.2:
        return
    f["compact"] = True
    w = _field_width_mm(f, cfg)
    if field_x + w <= right_max - 0.2:
        return
    groups = list(f.get("groups") or [])
    if len(groups) >= 2:
        f["layout"] = "two_rows"
    w = _field_width_mm(f, cfg)
    if field_x + w <= right_max - 0.2:
        return


def _bbox(
    f: dict[str, Any],
    cfg: dict[str, Any],
    left_min: float,
    right_max: float,
    default_y: float,
) -> tuple[float, float, float, float]:
    w = _field_width_mm(f, cfg)
    h = _field_height_mm(f, cfg)
    x = float(f.get("x_mm", left_min))
    y = float(f.get("y_mm", default_y))
    x = max(left_min, min(x, right_max - w))
    return x, y, w, h


def _resolve_identity_audit_overlaps(
    fields: list[dict[str, Any]],
    cfg: dict[str, Any],
    *,
    left_min: float,
    right_max: float,
    default_y: float,
    audit_pad: float,
    stack_gap: float,
) -> None:
    """PDF ilə eyni sıx audit düzbucaqları üzrə kəsişməni aradan qaldırır (yalnız aşağı sürüşdürür)."""
    from app.services.dim_identity import identity_field_audit_boxes
    from app.services.layout_audit import _overlap_depth_mm, _should_report_identity_overlap

    for _ in range(80):
        indexed: list[tuple[dict[str, Any], int]] = []
        for fi, f in enumerate(fields):
            for box in identity_field_audit_boxes(
                f, cfg, left_min=left_min, default_y=default_y,
            ):
                indexed.append((box, fi))
        moved = False
        for i, (b1, fi1) in enumerate(indexed):
            for j in range(i + 1, len(indexed)):
                b2, fi2 = indexed[j]
                if fi1 == fi2:
                    continue
                report, depth = _should_report_identity_overlap(b1, b2, audit_pad)
                if not report or depth < 0.05:
                    continue
                f1, f2 = fields[fi1], fields[fi2]
                m1, m2 = _mobility(f1.get("kind")), _mobility(f2.get("kind"))
                if m1 > m2:
                    tgt, other = f1, f2
                elif m2 > m1:
                    tgt, other = f2, f1
                else:
                    tgt = f1 if float(f1.get("y_mm", default_y)) >= float(f2.get("y_mm", default_y)) else f2
                    other = f2 if tgt is f1 else f1
                x1, y1, w1, h1 = (
                    float(b1["x"]), float(b1["y"]), float(b1["w"]), float(b1["h"]),
                )
                x2, y2, w2, h2 = (
                    float(b2["x"]), float(b2["y"]), float(b2["w"]), float(b2["h"]),
                )
                if tgt is other:
                    tgt = f1 if float(f1.get("y_mm", default_y)) >= float(f2.get("y_mm", default_y)) else f2
                push = _overlap_depth_mm(x1, y1, w1, h1, x2, y2, w2, h2) + stack_gap
                ny = round(float(tgt.get("y_mm", default_y)) + push, 2)
                if ny > float(tgt.get("y_mm", default_y)) + 0.02:
                    tgt["y_mm"] = ny
                    moved = True
                    break
            if moved:
                break
        if not moved:
            break


def _resolve_identity_field_overlaps(
    fields: list[dict[str, Any]],
    out: dict[str, Any],
    *,
    left_min: float,
    right_max: float,
    default_y: float,
    audit_pad: float,
    stack_gap: float,
) -> None:
    """Sahələrin kəsişməsini həll edir — daha mobil olan aşağı düşür.

    Əvvəlcə `{digit_groups, mcq_groups}` cütü skip edilirdi (chronic-overlap
    halında səssiz qalırdı); indi mobility-yə görə mcq_groups digit_groups
    altına itələnir (audit-də səssiz kəsişmə qalmasın deyə).
    """
    for _ in range(50):
        moved = False
        boxes: list[tuple[float, float, float, float, dict[str, Any]]] = []
        for f in fields:
            x, y, w, h = _bbox(f, out, left_min, right_max, default_y)
            boxes.append((x, y, w, h, f))
        for i in range(len(boxes)):
            x1, y1, w1, h1, f1 = boxes[i]
            for j in range(i + 1, len(boxes)):
                x2, y2, w2, h2, f2 = boxes[j]
                if not _inflated_overlap(x1, y1, w1, h1, x2, y2, w2, h2, audit_pad):
                    continue
                m1, m2 = _mobility(f1.get("kind")), _mobility(f2.get("kind"))
                if m1 > m2:
                    ny = y2 + h2 + stack_gap
                    if float(f1.get("y_mm", 0)) < ny - 0.05:
                        f1["y_mm"] = round(ny, 2)
                        moved = True
                elif m2 > m1:
                    ny = y1 + h1 + stack_gap
                    if float(f2.get("y_mm", 0)) < ny - 0.05:
                        f2["y_mm"] = round(ny, 2)
                        moved = True
                else:
                    yf1 = float(f1.get("y_mm", default_y))
                    yf2 = float(f2.get("y_mm", default_y))
                    if yf1 >= yf2:
                        ny = y2 + h2 + stack_gap
                        if yf1 < ny - 0.05:
                            f1["y_mm"] = round(ny, 2)
                            moved = True
                    else:
                        ny = y1 + h1 + stack_gap
                        if yf2 < ny - 0.05:
                            f2["y_mm"] = round(ny, 2)
                            moved = True
        if not moved:
            break


def _tighten_digit_groups_for_height(
    f: dict[str, Any],
    cfg: dict[str, Any],
    target_h: float,
    *,
    right_max: float | None = None,
) -> None:
    """digit_groups-u compact + (mümkün olarsa) tək sətir rejiminə gətirir ki,
    hündürlüyü `target_h` ətrafında qalsın.

    1) `compact=True` qoyur (digit_vgap kiçilir, sətir-arası boşluq azalır)
    2) Hələ uzundursa və `layout=="two_rows"`-dursa, `right_max` verilibsə həm də
       tək sətir rejiminə qaytarır (eninə yer çatırsa). Eninə yer çatmırsa
       `two_rows` saxlanılır — daha sonra çağıran tərəf `single_page_layout`-ı
       söndürəcək.
    """
    if f.get("kind") != "digit_groups":
        return
    h = _field_height_mm(f, cfg)
    if h <= target_h + 0.2:
        return
    if not bool(f.get("compact")):
        f["compact"] = True
        h = _field_height_mm(f, cfg)
        if h <= target_h + 0.2:
            return
    if f.get("layout") == "two_rows" and right_max is not None:
        prev_layout = f.get("layout")
        f["layout"] = None
        x = float(f.get("x_mm", 0))
        new_w = _field_width_mm(f, cfg)
        if x + new_w > right_max - 0.2:
            f["layout"] = prev_layout


def _stack_mcq_groups_below_digit_groups(
    fields: list[dict[str, Any]],
    out: dict[str, Any],
    *,
    out_raw: dict[str, Any] | None = None,
    left_min: float,
    right_max: float,
    default_y: float,
    stack_gap: float,
    bottom_safe: float | None = None,
) -> None:
    """«digit_groups» altında «mcq_groups»; footer təhlükəsiz xəttindən yuxarı saxlanır.

    Əgər `bottom_safe` məhdudiyyəti ilə mcq_groups-un `cap_top`-u digit_groups daxilinə
    düşürsə (yəni digit_groups artıq çox boyludur), digit_groups-u compact+tək sətir
    rejiminə gətirməyə çalışırıq. Buna baxmayaraq yer çatmasa, `out_raw` cfg-də
    `single_page_layout=False` qoyub MCQ-nı 2-ci səhifəyə itirik və mcq_groups-u
    digit_groups-un təsirsiz aşağısına yerləşdiririk (kanvas overlap görünməsin).
    """
    fd = next((x for x in fields if x.get("kind") == "digit_groups"), None)
    fm = next((x for x in fields if x.get("kind") == "mcq_groups"), None)
    if fd is None or fm is None:
        return
    _, yd, _, hd = _bbox(fd, out, left_min, right_max, default_y)
    hm = _field_height_mm(fm, out)
    below_digit = yd + hd + stack_gap
    ym = float(fm.get("y_mm", default_y))
    if bottom_safe is not None:
        cap_top = float(bottom_safe) - hm - 0.02
        if below_digit > cap_top:
            target_h = max(1.0, cap_top - yd - stack_gap)
            _tighten_digit_groups_for_height(fd, out, target_h, right_max=right_max)
            _, yd, _, hd = _bbox(fd, out, left_min, right_max, default_y)
            below_digit = yd + hd + stack_gap
        if below_digit > cap_top:
            if out_raw is not None and bool(out_raw.get("single_page_layout", True)):
                out_raw["single_page_layout"] = False
            ym = max(below_digit, ym)
        else:
            ym = min(max(below_digit, ym), cap_top)
    else:
        ym = max(below_digit, ym)
    fm["y_mm"] = round(ym, 2)


def _max_identity_stack_bottom_mm(
    fields: list[dict[str, Any]],
    out: dict[str, Any],
    *,
    top_zone: float,
    default_y: float,
) -> float:
    mx_b = top_zone + 3.0 + 7.0
    for f in fields:
        y0 = float(f.get("y_mm", default_y))
        mx_b = max(mx_b, y0 + _field_height_mm(f, out))
    return float(mx_b)


def _lift_identity_fields_to_ceiling_mm(
    fields: list[dict[str, Any]],
    out: dict[str, Any],
    *,
    top_zone: float,
    default_y: float,
    ceiling_mm: float,
) -> None:
    """Şəxsiyyət yığınının altı `ceiling_mm`-i keçməsin; üstə yapışmış sahələr qalır, qalanlar yuxarı sıçrayır."""
    y_floor = top_zone - 0.25
    for _ in range(200):
        mx_b = _max_identity_stack_bottom_mm(
            fields, out, top_zone=top_zone, default_y=default_y,
        )
        if mx_b <= float(ceiling_mm) - 0.08:
            return
        slack = mx_b - float(ceiling_mm) + 0.25
        movable = [
            f for f in fields
            if float(f.get("y_mm", default_y)) > y_floor + 0.03
        ]
        if not movable:
            return
        headroom = min(float(f.get("y_mm", default_y)) - y_floor for f in movable)
        step = min(1.15, slack, headroom)
        if step < 1e-4:
            return
        for f in movable:
            y0 = float(f.get("y_mm", default_y))
            f["y_mm"] = round(max(y_floor, y0 - step), 2)


def _compress_freeform_identity_vertical_span(
    fields: list[dict[str, Any]],
    out: dict[str, Any],
    *,
    top_zone: float,
    default_y: float,
    bottom_safe: float,
) -> None:
    """
    Son çarə: bloklar arasındakı «boş hava»nı proporsional sıxır ki, 1-ci səhifə footer təhlükəsiz
    xəttindən aşağı düşməsin (iki səhifəli PDF-də də şəxsiyyət 1-ci səhifədə qalır).
    """
    mx_b = _max_identity_stack_bottom_mm(
        fields, out, top_zone=top_zone, default_y=default_y,
    )
    if mx_b <= float(bottom_safe) - 0.15:
        return
    top_ref = top_zone + 0.35
    span = mx_b - top_ref
    target = float(bottom_safe) - top_ref - 0.35
    if span <= 1e-3 or target <= 6.0:
        return
    scale = min(1.0, target / span)
    scale = min(scale, 0.985)
    scale = max(0.58, scale)
    for f in fields:
        y0 = float(f.get("y_mm", default_y))
        f["y_mm"] = round(top_ref + (y0 - top_ref) * scale, 2)


def apply_freeform_identity_layout_guards(cfg: dict[str, Any]) -> dict[str, Any]:
    """
    cfg surəti qaytarır; freeform + identity deyilsə və ya sahə yoxdursa toxunulmur.

    Bütün ölçü çağırışları (`_field_height_mm`, `_field_width_mm`) PDF generator ilə
    eyni `effective_layout_config` üzərində aparılır — beləliklə audit-də görünən
    boylar PDF-də gerçəkdən çəkilən boylarla eyni olur.

    `out["single_page_layout"] is False` olanda (yəni iki səhifəlik PDF) MCQ şəbəkəsi
    1-ci səhifədə deyil; identity bütün zonaya yayıla bilər → mcq_grid bumping və
    şəxsiyyəti şəbəkə üstü tavanına qaldırma addımları atlanır.
    """
    out = copy.deepcopy(cfg)
    if out.get("layout_mode") != "freeform" or not bool(out.get("identity_section", True)):
        return out
    raw = out.get("identity_fields")
    if not isinstance(raw, list) or not raw:
        return out

    fields: list[dict[str, Any]] = [copy.deepcopy(x) for x in raw if isinstance(x, dict)]
    if not fields:
        return out

    # `identity_fields` siyahısını dərhal `out`-a yerləşdiririk ki, `eff` (şallow kopya)
    # ilə eyni list reference paylaşsın — sahə x/y mutasiyaları hər iki cfg-də görünsün.
    out["identity_fields"] = fields

    pw_mm, ph_mm, _paper = paper_size_mm(out)
    eff = effective_layout_config(out, pw_mm, ph_mm)
    left_min = float(content_left_mm())
    right_max = pw_mm - float(L_BASE["margin"]) - float(SAFE_CONTENT_INSET_MM)
    top_zone = float(identity_zone_top_mm())
    bottom_safe = (
        ph_mm
        - float(L_BASE["margin"])
        - float(L_BASE["footer_h"])
        - float(MIN_GRID_ABOVE_FOOTER_MM)
        - float(SAFE_CONTENT_INSET_MM)
    )
    default_y = top_zone + 10.0
    span_x = max(1.0, right_max - left_min - 0.25)
    # Audit `_inflated_overlap` hər düzbucaqlıya `pad` əlavə edir → vertikal ayırma ≥ 2*pad
    audit_pad = max(float(MIN_FREE_FORM_FIELD_GAP_MM), 0.8)
    stack_gap = float(MIN_IDENTITY_STACK_GAP_MM)

    # `single_page_layout=False` olanda MCQ 2-ci səhifədədir — identity 1-ci səhifədə
    # bütün zonaya genişlənə bilər, mcq_grid anchor heç bir məhdudiyyət vermir.
    two_page_mode = bool(out.get("single_page_layout", True)) is False

    for f in fields:
        _tighten_digit_groups_for_width(
            f,
            eff,
            span_x,
            float(f.get("x_mm", left_min)),
            right_max,
        )

    for f in fields:
        w = _field_width_mm(f, eff)
        x = float(f.get("x_mm", left_min))
        y = float(f.get("y_mm", default_y))
        x = max(left_min, min(x, right_max - w))
        y = max(top_zone - 0.25, y)
        f["x_mm"] = round(x, 2)
        f["y_mm"] = round(y, 2)

    _resolve_identity_field_overlaps(
        fields,
        eff,
        left_min=left_min,
        right_max=right_max,
        default_y=default_y,
        audit_pad=audit_pad,
        stack_gap=stack_gap,
    )

    _lift_identity_fields_to_ceiling_mm(
        fields,
        eff,
        top_zone=top_zone,
        default_y=default_y,
        ceiling_mm=bottom_safe,
    )

    _resolve_identity_field_overlaps(
        fields,
        eff,
        left_min=left_min,
        right_max=right_max,
        default_y=default_y,
        audit_pad=audit_pad,
        stack_gap=stack_gap,
    )

    _lift_identity_fields_to_ceiling_mm(
        fields,
        eff,
        top_zone=top_zone,
        default_y=default_y,
        ceiling_mm=bottom_safe,
    )

    _resolve_identity_field_overlaps(
        fields,
        eff,
        left_min=left_min,
        right_max=right_max,
        default_y=default_y,
        audit_pad=audit_pad,
        stack_gap=stack_gap,
    )

    _lift_identity_fields_to_ceiling_mm(
        fields,
        eff,
        top_zone=top_zone,
        default_y=default_y,
        ceiling_mm=bottom_safe,
    )

    # İki səhifəli PDF-də MCQ şəbəkəsi 1-ci səhifədə deyil → mcq_grid anchor bumping və
    # şəbəkə altı tavanı limiti şəxsiyyət yığınına məhdudiyyət vermir.
    if not two_page_mode:
        mg = dict(out.get("mcq_grid") or {})
        id_h = _identity_height_mm_for_layout(out)
        need_top = float(freeform_mcq_grid_top_anchor_mm(mg, id_h, out))
        mx_b = _max_identity_stack_bottom_mm(
            fields, eff, top_zone=top_zone, default_y=default_y,
        )
        sep_need = float(L_BASE["sep_v"]) * 0.85
        if mx_b > need_top - sep_need:
            bump = mx_b + float(L_BASE["sep_v"])
            raw_top = mg.get("top_mm")
            try:
                cur = float(raw_top) if raw_top is not None else 0.0
            except (TypeError, ValueError):
                cur = 0.0
            anchor_max = float(freeform_mcq_grid_top_anchor_max_mm(ph_mm))
            new_top = round(min(max(bump, need_top), anchor_max), 1)
            if cur > 0.0:
                new_top = round(min(max(cur, bump, need_top), anchor_max), 1)
            mg["top_mm"] = new_top
            out["mcq_grid"] = mg

        sep_fit = float(L_BASE["sep_v"]) * 0.85
        for _ in range(6):
            mg2 = dict(out.get("mcq_grid") or {})
            id_h2 = _identity_height_mm_for_layout(out)
            grid_top = float(freeform_mcq_grid_top_anchor_mm(mg2, id_h2, out))
            ceiling = min(grid_top - sep_fit, bottom_safe)
            _lift_identity_fields_to_ceiling_mm(
                fields,
                eff,
                top_zone=top_zone,
                default_y=default_y,
                ceiling_mm=ceiling,
            )
            _stack_mcq_groups_below_digit_groups(
                fields,
                eff,
                out_raw=out,
                left_min=left_min,
                right_max=right_max,
                default_y=default_y,
                stack_gap=stack_gap,
                bottom_safe=bottom_safe,
            )
            _resolve_identity_field_overlaps(
                fields,
                eff,
                left_min=left_min,
                right_max=right_max,
                default_y=default_y,
                audit_pad=audit_pad,
                stack_gap=stack_gap,
            )

    _stack_mcq_groups_below_digit_groups(
        fields,
        eff,
        out_raw=out,
        left_min=left_min,
        right_max=right_max,
        default_y=default_y,
        stack_gap=stack_gap,
        bottom_safe=None if two_page_mode else bottom_safe,
    )
    for _ in range(3):
        _compress_freeform_identity_vertical_span(
            fields,
            eff,
            top_zone=top_zone,
            default_y=default_y,
            bottom_safe=bottom_safe,
        )
        if _max_identity_stack_bottom_mm(
            fields, eff, top_zone=top_zone, default_y=default_y,
        ) <= float(bottom_safe) - 0.12:
            break
    _stack_mcq_groups_below_digit_groups(
        fields,
        eff,
        out_raw=out,
        left_min=left_min,
        right_max=right_max,
        default_y=default_y,
        stack_gap=stack_gap,
        bottom_safe=bottom_safe,
    )
    _resolve_identity_field_overlaps(
        fields,
        eff,
        left_min=left_min,
        right_max=right_max,
        default_y=default_y,
        audit_pad=audit_pad,
        stack_gap=stack_gap,
    )

    out["identity_fields"] = fields
    return out


def apply_freeform_identity_layout_guards_light(cfg: dict[str, Any]) -> dict[str, Any]:
    """
    Dizaynerdə istifadəçinin əl ilə yerləşdirdiyi sahələri saxlayır:
    yalnız x sərhədi və mcq_grid anchor (tək səhifə) yenilənir; vertikal sıxışdırma/yığın yoxdur.
    """
    out = copy.deepcopy(cfg)
    if out.get("layout_mode") != "freeform" or not bool(out.get("identity_section", True)):
        return out
    raw = out.get("identity_fields")
    if not isinstance(raw, list) or not raw:
        return out

    fields: list[dict[str, Any]] = [copy.deepcopy(x) for x in raw if isinstance(x, dict)]
    if not fields:
        return out
    out["identity_fields"] = fields

    pw_mm, ph_mm, _paper = paper_size_mm(out)
    eff = effective_layout_config(out, pw_mm, ph_mm)
    left_min = float(content_left_mm())
    right_max = pw_mm - float(L_BASE["margin"]) - float(SAFE_CONTENT_INSET_MM)
    top_zone = float(identity_zone_top_mm())
    two_page_mode = bool(out.get("single_page_layout", True)) is False

    for f in fields:
        w = _field_width_mm(f, eff)
        x = max(left_min, min(float(f.get("x_mm", left_min)), right_max - w))
        y = max(top_zone - 0.25, float(f.get("y_mm", top_zone + 10.0)))
        f["x_mm"] = round(x, 2)
        f["y_mm"] = round(y, 2)

    default_y = top_zone + 10.0
    audit_pad = max(float(MIN_FREE_FORM_FIELD_GAP_MM), 0.8)
    stack_gap = float(MIN_IDENTITY_STACK_GAP_MM)
    _resolve_identity_audit_overlaps(
        fields,
        eff,
        left_min=left_min,
        right_max=right_max,
        default_y=default_y,
        audit_pad=audit_pad,
        stack_gap=stack_gap,
    )

    if not two_page_mode:
        mg = dict(out.get("mcq_grid") or {})
        id_h = _identity_height_mm_for_layout(out)
        need_top = float(freeform_mcq_grid_top_anchor_mm(mg, id_h, out))
        mx_b = _max_identity_stack_bottom_mm(fields, eff, top_zone=top_zone, default_y=top_zone + 10.0)
        sep_need = float(L_BASE["sep_v"]) * 0.85
        if mx_b > need_top - sep_need:
            bump = mx_b + float(L_BASE["sep_v"])
            raw_top = mg.get("top_mm")
            try:
                cur = float(raw_top) if raw_top is not None else 0.0
            except (TypeError, ValueError):
                cur = 0.0
            anchor_max = float(freeform_mcq_grid_top_anchor_max_mm(ph_mm))
            new_top = round(min(max(bump, need_top), anchor_max), 1)
            if cur > 0.0:
                new_top = round(min(max(cur, bump, need_top), anchor_max), 1)
            mg["top_mm"] = new_top
            out["mcq_grid"] = mg

    out["identity_fields"] = fields
    return out


def _mcq_bottom_safe_mm(ph_mm: float) -> float:
    return (
        float(ph_mm)
        - float(L_BASE["margin"])
        - float(L_BASE["footer_h"])
        - float(MIN_GRID_ABOVE_FOOTER_MM)
        - float(SAFE_CONTENT_INSET_MM)
    )


def _auto_bump_columns_for_mcq_overflow(cfg: dict[str, Any], pw_mm: float, ph_mm: float) -> dict[str, Any]:
    """
    Üfüqi sütun rejimində suallar footer altına düşürsə sütun sayını (max 6) artırır.
    120 sual / 2 sütun tipik hallarda 4 sütuna qaldırılır ki, bütün suallar çapda görünsün.
    Əlavə: 4–5 variant sütun eninə sığmırsa sütun sayını azaldır (daha geniş sütun).
    """
    out = dict(cfg)
    if not mcq_options_horizontal(out):
        return out
    bottom_safe = _mcq_bottom_safe_mm(ph_mm)
    cols = max(1, min(6, int(out.get("columns_count", 2))))
    while cols < 6:
        test = {**out, "columns_count": cols}
        bb = mcq_content_bottom_mm(test, pw_mm, ph_mm)
        if bb is None or float(bb) <= bottom_safe + 0.15:
            out["columns_count"] = cols
            break
        cols += 1
    else:
        out["columns_count"] = cols

    # Variantlar (A–E) üfüqi olaraq sütuna sığsın — lazım olsa sütun sayını azalt
    from app.services.dim_sheet_layout import (
        fit_horizontal_row_pitch,
        resolve_mcq_spacing,
    )

    options = max(2, min(5, int(out.get("options_per_question", 5))))
    left = content_left_mm()
    avail_w = max(10.0, pw_mm - left - float(L_BASE["margin"]))
    cols = max(1, min(6, int(out.get("columns_count", 2))))
    gt = 40.0
    while cols > 1:
        bd, _vg, hg, _nc = resolve_mcq_spacing(
            ph_mm, cols, max(1, int(out.get("question_count", 50))), gt, out,
            pw_mm=pw_mm, left_mm=left,
        )
        col_w = avail_w / cols
        fitted = fit_horizontal_row_pitch(col_w, options, bd, hg)
        # Pitch hələ də balondan kiçikdirsə və ya sığmayıbsa — daha az sütun
        needed = float(L_BASE["q_num_w"]) + (options - 1) * fitted + bd + 1.5
        if needed <= col_w + 0.2 and fitted + 1e-6 >= bd + 0.5:
            break
        cols -= 1
    out["columns_count"] = cols
    return out


def apply_layout_publish_guards(cfg: dict[str, Any], *, preserve_identity_positions: bool = False) -> dict[str, Any]:
    """
    Freeform şəxsiyyət qorunması + lazım olsa «tək səhifə» bayrağını söndürür ki,
    daşan MCQ avtomatik ikinci səhifəyə keçsin (PDF/audit ilə uyğun).

    `preserve_identity_positions=True` — şablon saxlanarkən sahə y_mm/x_mm toxunulmaz
    (yalnız yüngül x clamp və mcq_grid anchor).
    """
    out = copy.deepcopy(cfg)
    pw_mm, ph_mm, _paper = paper_size_mm(out)
    out = _auto_bump_columns_for_mcq_overflow(out, pw_mm, ph_mm)
    if answer_sheet_two_page_required(out, pw_mm, ph_mm):
        out["single_page_layout"] = False
    if preserve_identity_positions:
        out = apply_freeform_identity_layout_guards_light(out)
    else:
        out = apply_freeform_identity_layout_guards(out)
    pw_mm, ph_mm, _paper = paper_size_mm(out)
    out = _auto_bump_columns_for_mcq_overflow(out, pw_mm, ph_mm)
    if answer_sheet_two_page_required(out, pw_mm, ph_mm):
        out["single_page_layout"] = False
    return out
