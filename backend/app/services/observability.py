"""Lightweight observability hooks for student app / API."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("imtahansistemi.observability")


def track_event(name: str, *, properties: dict[str, Any] | None = None) -> None:
    """Product analytics stub — wire to Sentry/Segment later."""
    logger.info("event=%s props=%s", name, properties or {})


def capture_exception(exc: BaseException, *, context: dict[str, Any] | None = None) -> None:
    logger.exception("error=%s context=%s", type(exc).__name__, context or {})
