from __future__ import annotations

from app.models.entities import QuestionDifficulty


def normalize_difficulty(value: QuestionDifficulty | str | None) -> str:
    if value is None:
        return QuestionDifficulty.MEDIUM.value
    if isinstance(value, QuestionDifficulty):
        return value.value
    s = str(value).strip().lower()
    if s in ("easy", "medium", "hard"):
        return s
    return QuestionDifficulty.MEDIUM.value


def parse_difficulty_csv(cell: str | None) -> str:
    if not cell:
        return QuestionDifficulty.MEDIUM.value
    raw = cell.strip().lower()
    mapping = {
        "e": QuestionDifficulty.EASY.value,
        "easy": QuestionDifficulty.EASY.value,
        "asan": QuestionDifficulty.EASY.value,
        "m": QuestionDifficulty.MEDIUM.value,
        "medium": QuestionDifficulty.MEDIUM.value,
        "orta": QuestionDifficulty.MEDIUM.value,
        "h": QuestionDifficulty.HARD.value,
        "hard": QuestionDifficulty.HARD.value,
        "çətin": QuestionDifficulty.HARD.value,
        "cetin": QuestionDifficulty.HARD.value,
    }
    return mapping.get(raw, normalize_difficulty(raw))
