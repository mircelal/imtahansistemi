"""Cavab açarı validasiya qaydaları (router səviyyəsində məntiq)."""


def _valid_letters(options_per_question: int) -> set[str]:
    opts = max(2, min(int(options_per_question or 4), 5))
    return {chr(ord("A") + i) for i in range(opts)}


def _validate_payload(payload: list[dict], expected: int, options: int) -> str | None:
    valid = _valid_letters(options)
    seen: set[int] = set()
    for item in payload:
        qn = int(item["question_number"])
        if qn < 1 or qn > expected:
            return f"range:{qn}"
        if qn in seen:
            return f"dup:{qn}"
        seen.add(qn)
        ca = str(item["correct_answer"]).strip().upper()
        if ca not in valid:
            return f"letter:{ca}"
        if float(item["points"]) < 0:
            return f"points:{qn}"
    if len(payload) != expected:
        return "length"
    return None


def test_valid_answer_key():
    payload = [{"question_number": i, "correct_answer": "A", "points": 1} for i in range(1, 4)]
    assert _validate_payload(payload, 3, 4) is None


def test_rejects_duplicate_question():
    payload = [
        {"question_number": 1, "correct_answer": "A", "points": 1},
        {"question_number": 1, "correct_answer": "B", "points": 1},
    ]
    assert _validate_payload(payload, 2, 4) == "dup:1"


def test_rejects_invalid_letter():
    payload = [{"question_number": 1, "correct_answer": "Z", "points": 1}]
    assert _validate_payload(payload, 1, 4) == "letter:Z"


def test_rejects_negative_points():
    payload = [{"question_number": 1, "correct_answer": "A", "points": -1}]
    assert _validate_payload(payload, 1, 4) == "points:1"
