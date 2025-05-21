from __future__ import annotations

from typing import Any, Optional

import httpx


class ConvexClient:
    """Minimal async client for Convex HTTP API used in tests."""

    def __init__(self, base_url: str, token: Optional[str] = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self._client = httpx.AsyncClient()

    async def close(self) -> None:  # pragma: no cover - unused in tests
        await self._client.aclose()

    async def mutation(self, name: str, args: dict[str, Any]) -> Any:
        url = f"{self.base_url}/api/{name}"
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        resp = await self._client.post(url, json=args, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def query(self, name: str, args: dict[str, Any]) -> Any:
        url = f"{self.base_url}/api/{name}"
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        resp = await self._client.post(url, json=args, headers=headers)
        resp.raise_for_status()
        return resp.json()
