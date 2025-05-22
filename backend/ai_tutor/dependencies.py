# ai_tutor/dependencies.py
import os
from fastapi import HTTPException, status, Request
from supabase import create_client, Client
from dotenv import load_dotenv
from openai import AsyncOpenAI
from openai._base_client import AsyncHttpxClientWrapper  # type: ignore
from redis.asyncio import Redis as _Redis  # type: ignore
import redis.asyncio as _redis_asyncio
from ai_tutor.services.convex_client import ConvexClient

# Load environment variables specifically for dependencies if needed,
# though they should be loaded by the main app process already.
load_dotenv()

# --- Convex Configuration ---
CONVEX_URL = os.environ.get("CONVEX_URL")
CONVEX_ADMIN_KEY = os.environ.get("CONVEX_ADMIN_KEY")



def get_convex_config() -> dict[str, str]:
    """Return Convex configuration values from the environment."""
    if not CONVEX_URL or not CONVEX_ADMIN_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Convex configuration is not available. Check backend environment variables."
        )
    return {"url": CONVEX_URL, "admin_key": CONVEX_ADMIN_KEY}

# Create a single global AsyncOpenAI client and share it with the `agents`
# package so that all model providers use the exact same instance.
openai_client = AsyncOpenAI()

# Note: we register this client with the agents SDK in `ai_tutor.api` *after*
# `agents` has been fully imported, to avoid a circular‑import crash.

def get_openai():
    """FastAPI dependency returning the shared AsyncOpenAI client."""
    return openai_client 

# Monkey‑patch OpenAI client wrapper to avoid AttributeError at program exit
# Preserve original __del__
_orig_del = AsyncHttpxClientWrapper.__del__


def _safe_del(self):  # noqa: D401
    """A safer __del__ that swallows the httpx ClientState cleanup error.

    When Python shuts down, httpx's `ClientState` enum may already be
    garbage‑collected. Accessing `self._state` then raises AttributeError,
    which pollutes stderr with tracebacks.  We ignore that specific case.
    """

    try:
        _orig_del(self)
    except AttributeError as exc:
        if "_state" not in str(exc):
            raise  # Unexpected attribute error, re‑raise
        # else: swallow – it's the known shutdown race condition.


# Install the patch only once
if getattr(AsyncHttpxClientWrapper.__del__, "_patched", False) is False:  # type: ignore[attr-defined]
    AsyncHttpxClientWrapper.__del__ = _safe_del  # type: ignore[assignment]
    AsyncHttpxClientWrapper.__del__._patched = True  # type: ignore[attr-defined] 

# --- Redis Client Initialization (Phase-1) ---
_REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
try:
    REDIS_CLIENT: _Redis | None = _redis_asyncio.from_url(
        _REDIS_URL,
        decode_responses=False,  # store raw bytes – Yjs snapshots are binary
    )
    print(f"Redis client initialised (url={_REDIS_URL}).")
except Exception as _e:  # pragma: no cover
    REDIS_CLIENT = None
    print(f"ERROR: Failed to initialise Redis client: {_e}")

async def get_redis_client() -> _Redis:
    """FastAPI dependency to retrieve the global async Redis client."""
    if REDIS_CLIENT is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis client is not available. Check backend configuration and logs.",
        )
    return REDIS_CLIENT

# --- Convex Client Initialization ---
convex_url = os.environ.get("CONVEX_URL")

CONVEX_BASE_CLIENT: ConvexClient | None = None
if convex_url:
    CONVEX_BASE_CLIENT = ConvexClient(convex_url)
    print("Convex client configured.")
else:
    print("WARNING: CONVEX_URL environment variable not set; Convex disabled.")


async def get_convex_client(request: Request) -> ConvexClient:
    """Return a ConvexClient bound to the incoming auth token."""
    if CONVEX_BASE_CLIENT is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Convex client is not available."
        )

    auth = request.headers.get("Authorization", "")
    token = auth.split(" ", 1)[1] if auth.lower().startswith("bearer ") else None
    return ConvexClient(CONVEX_BASE_CLIENT.base_url, token=token)
