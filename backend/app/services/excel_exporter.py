from io import BytesIO

from openpyxl import Workbook


def export_scan_results_excel(rows: list[dict]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Scan Results"
    ws.append(["Result ID", "Session ID", "Student ID", "Score", "Status"])
    for row in rows:
        ws.append(
            [
                row.get("id"),
                row.get("session_id"),
                row.get("student_id"),
                row.get("score"),
                row.get("status"),
            ]
        )
    out = BytesIO()
    wb.save(out)
    return out.getvalue()
