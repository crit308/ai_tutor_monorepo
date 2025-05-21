# ai_tutor/dependencies.py
import os
from fastapi import HTTPException, status
try:
    from supabase import create_client, Client  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    create_client = None
    from typing import Any as Client
from dotenv import load_dotenv
try:
    from openai import AsyncOpenAI
    from openai._base_client import AsyncHttpxClientWrapper  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    AsyncOpenAI = None
    class AsyncHttpxClientWrapper:
        pass
from redis.asyncio import Redis as _Redis  # type: ignore
import redis.asyncio as _redis_asyncio

# Load environment variables specifically for dependencies if needed,
# though they should be loaded by the main app process already.
load_dotenv()

# --- Supabase Client Initialization ---
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_KEY") # Use Service Key for backend operations

SUPABASE_CLIENT: Client | None = None
if create_client and supabase_url and supabase_key:
    try:
        SUPABASE_CLIENT = create_client(supabase_url, supabase_key)
        print("Supabase client initialized successfully in dependencies module.")
    except Exception as e:
        print(f"ERROR: Failed to initialize Supabase client in dependencies module: {e}")
        SUPABASE_CLIENT = None
else:
    print("WARNING: Supabase client not configured or 'supabase' package missing.")


# --- Dependency Function ---
async def get_supabase_client() -> Client:
    """FastAPI dependency to get the initialized Supabase client."""
    if SUPABASE_CLIENT is None:
        # This condition should ideally not be met if env vars are set correctly
        # and initialization succeeded above.
        print("ERROR: get_supabase_client called but client is not initialized.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase client is not available. Check backend configuration and logs."
        )
    return SUPABASE_CLIENT 

# Create a single global AsyncOpenAI client and share it with the `agents`
# package so that all model providers use the exact same instance.
if AsyncOpenAI is not None and os.environ.get("OPENAI_API_KEY"):
    openai_client = AsyncOpenAI()
else:  # pragma: no cover - fallback dummy
    class _DummyOpenAI:
        async def aclose(self):
            pass
    openai_client = _DummyOpenAI()

# Note: we register this client with the agents SDK in `ai_tutor.api` *after*
# `agents` has been fully imported, to avoid a circular‑import crash.

def get_openai():
    """FastAPI dependency returning the shared AsyncOpenAI client."""
    return openai_client 

# Monkey‑patch OpenAI client wrapper to avoid AttributeError at program exit
# Preserve original __del__
_orig_del = getattr(AsyncHttpxClientWrapper, "__del__", lambda self: None)


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
if hasattr(AsyncHttpxClientWrapper, "__del__") and getattr(AsyncHttpxClientWrapper.__del__, "_patched", False) is False:  # type: ignore[attr-defined]
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
from ai_tutor.convex_client import ConvexClient

convex_url = os.environ.get("CONVEX_URL")
convex_admin_key = os.environ.get("CONVEX_ADMIN_KEY")

CONVEX_CLIENT: ConvexClient | None = None
if convex_url and convex_admin_key:
    try:
        CONVEX_CLIENT = ConvexClient(convex_url, convex_admin_key)
        print("Convex client initialized successfully in dependencies module.")
    except Exception as e:
        print(f"ERROR: Failed to initialize Convex client in dependencies module: {e}")
else:
    print("WARNING: CONVEX_URL and CONVEX_ADMIN_KEY not provided. Convex client disabled.")

async def get_convex_client() -> ConvexClient:
    if CONVEX_CLIENT is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Convex client is not available. Check backend configuration and logs.",
        )
    return CONVEX_CLIENT
