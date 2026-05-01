import json
from typing import Any

import httpx

from app.config import get_settings

settings = get_settings()


class OMRClient:
    def __init__(self) -> None:
        self.base_url = settings.omr_service_url

    async def process_image(self, image_bytes: bytes, filename: str, template_config: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=60) as client:
            files = {"file": (filename, image_bytes, "image/jpeg")}
            response = await client.post(
                f"{self.base_url}/process",
                files=files,
                data={"template_config": json.dumps(template_config)},
            )
            response.raise_for_status()
            return response.json()
