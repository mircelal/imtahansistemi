"""Shared SlowAPI limiter — imported by main and routers (avoids circular imports)."""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import get_settings

_cfg = get_settings()
limiter = Limiter(key_func=get_remote_address, default_limits=[f"{_cfg.rate_limit_per_minute}/minute"])
