"""İki səhifəli skan: səhifə seçimi və stitch köməkçiləri."""

from app.worker.scan_tasks import (
    _page_hint_from_filename,
    _scan_image_allowed_for_template,
    _stitch_images_vertical,
)


def test_page_hint_detects_page2():
    assert _page_hint_from_filename("scan_page2.jpg") == 2
    assert _page_hint_from_filename("student-1-sheet_2.png") == 2


def test_page_hint_detects_page1():
    assert _page_hint_from_filename("page1_front.jpg") == 1


def test_two_page_non_stitched_skips_page1():
    cfg = {"single_page_layout": False, "omr_two_page_stitched": False}
    assert _scan_image_allowed_for_template("page1.jpg", cfg) is False
    assert _scan_image_allowed_for_template("page2.jpg", cfg) is True
    assert _scan_image_allowed_for_template("unknown.jpg", cfg) is True


def test_single_page_allows_all():
    cfg = {"single_page_layout": True}
    assert _scan_image_allowed_for_template("page1.jpg", cfg) is True


def test_stitch_vertical_doubles_height():
    from PIL import Image
    from io import BytesIO

    def _img(h: int) -> bytes:
        im = Image.new("RGB", (100, h), color=(200, 200, 200))
        buf = BytesIO()
        im.save(buf, format="JPEG")
        return buf.getvalue()

    top = _img(80)
    bot = _img(120)
    merged = _stitch_images_vertical(top, bot)
    out = Image.open(BytesIO(merged))
    assert out.height == 200
