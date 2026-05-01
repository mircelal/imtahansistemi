from pydantic import BaseModel


class ExamSummaryResponse(BaseModel):
    average: float
    minimum: float
    maximum: float
    std_dev: float
    participation: int


class ItemAnalysisItem(BaseModel):
    question_number: int
    correct_ratio: float
    wrong_ratio: float
    blank_ratio: float
