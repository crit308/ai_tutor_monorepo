import httpx

class ConvexClient:
    """Minimal async HTTP client for Convex mutations and queries."""

    def __init__(self, base_url: str, token: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.token = token

    async def _call(self, path: str, name: str, args: dict | None) -> dict:
        url = f"{self.base_url}/{path}/{name}"
        headers = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=args or {}, headers=headers)
            resp.raise_for_status()
            return resp.json()

    async def mutation(self, name: str, args: dict | None = None) -> dict:
        return await self._call("mutation", name, args)

    async def query(self, name: str, args: dict | None = None) -> dict:
        return await self._call("query", name, args)
