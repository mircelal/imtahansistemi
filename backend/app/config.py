from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    project_name: str = "OMR Exam System"
    environment: str = "development"
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    cors_origins: str = "http://localhost:3000"
    rate_limit_per_minute: int = 120

    # If set, POST /api/auth/bootstrap-admin requires matching X-Bootstrap-Token header or body setup_token
    bootstrap_setup_token: str | None = None

    database_url: str
    sync_database_url: str

    celery_broker_url: str
    celery_result_backend: str
    # 0 = os.cpu_count(); server resursuna görə miqyas
    celery_concurrency: int = 0

    minio_endpoint: str
    minio_root_user: str
    minio_root_password: str
    minio_secure: bool = False
    minio_bucket_uploads: str = "uploads"
    minio_bucket_reports: str = "reports"
    minio_bucket_sheets: str = "answer-sheets"

    omr_service_url: str = "http://omr-service:8001"
    omr_confidence_threshold: float = 0.85
    # 0 = os.cpu_count()
    omr_uvicorn_workers: int = 0

    wallet_enabled: bool = False

    # Payriff (optional — skeleton until credentials set)
    payriff_merchant_id: str | None = None
    payriff_secret_key: str | None = None
    payriff_checkout_base: str | None = None
    # Public app base for absolute return URLs (e.g. https://bilik.sayt.cam)
    public_app_url: str | None = None

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


UserRole = Literal["admin", "manager", "operator", "student"]
