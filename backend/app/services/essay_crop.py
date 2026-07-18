"""Essay bölgələrinin skan şəklindən kəsilməsi."""
from __future__ import annotations

from io import BytesIO
from typing import Any

from app.services.a3_fold_imposition import (
    A4_H_MM,
    A4_W_MM,
    is_a3_duplex_fold,
    split_scan_face_to_panels,
)
from app.services.dim_sheet_layout import page_dimensions_mm
from app.services.open_question_layout import essay_crop_rects_mm


def crop_essay_regions_from_image(
    image_bytes: bytes,
    cfg: dict[str, Any] | None,
    *,
    page_filter: int | None = None,
    panel_filter: int | None = None,
    page_width_mm: float | None = None,
    page_height_mm: float | None = None,
) -> dict[str, bytes]:
    """
    Qaytarır: question_number (str) → JPEG bytes.
    Koordinatlar mm (səhifə yuxarısından); şəkil ölçüsünə scale olunur.

    `page_width_mm` / `page_height_mm` verilməzsə cfg `paper_size`-dan götürülür
    (A4 210×297, A3L 420×297, …).
    """
    from PIL import Image

    if page_width_mm is None or page_height_mm is None:
        pw_cfg, ph_cfg = page_dimensions_mm(cfg)
        if page_width_mm is None:
            page_width_mm = pw_cfg
        if page_height_mm is None:
            page_height_mm = ph_cfg

    rects = essay_crop_rects_mm(cfg, page_filter=page_filter, panel_filter=panel_filter)
    if not rects:
        return {}

    im = Image.open(BytesIO(image_bytes)).convert("RGB")
    w_px, h_px = im.size
    sx = w_px / float(page_width_mm)
    sy = h_px / float(page_height_mm)

    out: dict[str, bytes] = {}
    for r in rects:
        qn = str(r["question_number"])
        x0 = int(max(0, r["x_mm"] * sx))
        y0 = int(max(0, r["y_mm"] * sy))
        x1 = int(min(w_px, (r["x_mm"] + r["w_mm"]) * sx))
        y1 = int(min(h_px, (r["y_mm"] + r["h_mm"]) * sy))
        if x1 <= x0 or y1 <= y0:
            continue
        crop = im.crop((x0, y0, x1, y1))
        buf = BytesIO()
        crop.save(buf, format="JPEG", quality=90)
        out[qn] = buf.getvalue()
    return out


def crop_essay_regions_a3_fold_face(
    image_bytes: bytes,
    cfg: dict[str, Any] | None,
    *,
    face: int = 1,
) -> dict[str, bytes]:
    """
    A3 landscape üzünü 2 A4 panelə bölüb hər panel üçün essay crop (panel mm koordinatları).
    """
    from PIL import Image

    im = Image.open(BytesIO(image_bytes)).convert("RGB")
    panels = split_scan_face_to_panels(im.width, im.height, face)
    out: dict[str, bytes] = {}
    for panel_num, box in panels.items():
        panel_im = im.crop(box)
        buf = BytesIO()
        panel_im.save(buf, format="JPEG", quality=95)
        part = crop_essay_regions_from_image(
            buf.getvalue(),
            cfg,
            panel_filter=int(panel_num),
            page_width_mm=A4_W_MM,
            page_height_mm=A4_H_MM,
        )
        out.update(part)
    return out


def crop_essay_regions_for_scan(
    image_bytes: bytes,
    cfg: dict[str, Any] | None,
    *,
    face: int | None = None,
) -> dict[str, bytes]:
    """Scan worker üçün: A3 fold isə panel üzrə, əks halda səhifə ölçüsü ilə."""
    if is_a3_duplex_fold(cfg):
        return crop_essay_regions_a3_fold_face(image_bytes, cfg, face=face or 1)
    return crop_essay_regions_from_image(image_bytes, cfg)


def mm_box_to_px(
    x_mm: float,
    y_mm: float,
    w_mm: float,
    h_mm: float,
    *,
    img_w: int,
    img_h: int,
    page_w_mm: float = 210.0,
    page_h_mm: float = 297.0,
) -> tuple[int, int, int, int]:
    sx = img_w / page_w_mm
    sy = img_h / page_h_mm
    return (
        int(x_mm * sx),
        int(y_mm * sy),
        int((x_mm + w_mm) * sx),
        int((y_mm + h_mm) * sy),
    )
