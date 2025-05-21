from __future__ import annotations

import httpx
from typing import Optional
from uuid import UUID


class ConvexClient:
    """Minimal async wrapper around Convex HTTP endpoints."""

    def __init__(self, base_url: str, admin_key: str):
        self.base_url = base_url.rstrip("/")
        self.admin_key = admin_key
        self._client = httpx.AsyncClient()

    async def close(self) -> None:
        await self._client.aclose()

    async def create_session(
        self,
        user_id: UUID,
        context: dict,
        folder_id: Optional[UUID] = None,
    ) -> UUID:
        payload = {
            "userId": str(user_id),
            "context": context,
            "folderId": str(folder_id) if folder_id else None,
        }
        resp = await self._client.post(
            f"{self.base_url}/createSession",
            json=payload,
            headers={"Authorization": f"Bearer {self.admin_key}"},
        )
        resp.raise_for_status()
        data = resp.json()
        return UUID(data["id"])

    async def get_session_context(self, session_id: UUID, user_id: UUID) -> Optional[dict]:
        params = {"sessionId": str(session_id), "userId": str(user_id)}
        resp = await self._client.get(
            f"{self.base_url}/getSessionContext",
            params=params,
            headers={"Authorization": f"Bearer {self.admin_key}"},
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json().get("context")

    async def update_session_context(self, session_id: UUID, user_id: UUID, context: dict) -> bool:
        payload = {
            "sessionId": str(session_id),
            "userId": str(user_id),
            "context": context,
        }
        resp = await self._client.post(
            f"{self.base_url}/updateSessionContext",
            json=payload,
            headers={"Authorization": f"Bearer {self.admin_key}"},
        )
        resp.raise_for_status()
        return resp.status_code == 200

    async def get_folder(self, folder_id: UUID, user_id: UUID) -> Optional[dict]:
        params = {"folderId": str(folder_id), "userId": str(user_id)}
        resp = await self._client.get(
            f"{self.base_url}/getFolder",
            params=params,
            headers={"Authorization": f"Bearer {self.admin_key}"},
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()
