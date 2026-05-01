from pydantic import BaseModel, Field


class PublicSettingsOut(BaseModel):
    system_name: str
    has_logo: bool


class AdminSettingsOut(BaseModel):
    system_name: str
    has_logo: bool


class SettingsUpdate(BaseModel):
    system_name: str = Field(..., min_length=1, max_length=255)
