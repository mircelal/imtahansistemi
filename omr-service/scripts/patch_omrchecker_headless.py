"""OMRChecker interaction.py — headless Docker üçün monitor fallback."""
from __future__ import annotations

from pathlib import Path

TARGET = Path("/opt/OMRChecker/src/utils/interaction.py")

PATCH_OLD = "monitor_window = get_monitors()[0]"

PATCH_NEW = """try:
    monitor_window = get_monitors()[0]
except Exception:  # headless Docker / CI — screeninfo enumerators yoxdur
    class _HeadlessMonitor:
        width = 1920
        height = 1080
        x = 0
        y = 0

    monitor_window = _HeadlessMonitor()"""


def main() -> None:
    if not TARGET.is_file():
        raise SystemExit(f"OMRChecker interaction.py tapılmadı: {TARGET}")
    text = TARGET.read_text(encoding="utf-8")
    if PATCH_OLD not in text:
        if "_HeadlessMonitor" in text:
            print("already patched")
            return
        raise SystemExit("Gözlənilən sətir tapılmadı — OMRChecker versiyası dəyişib")
    TARGET.write_text(text.replace(PATCH_OLD, PATCH_NEW), encoding="utf-8")
    print("patched", TARGET)


if __name__ == "__main__":
    main()
