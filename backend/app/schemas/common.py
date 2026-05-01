from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    message: str


class PaginatedResponse(BaseModel):
    items: list[dict]
    total: int
    page: int
    size: int


class HealthResponse(BaseModel):
    status: str = "ok"
    timestamp: datetime
