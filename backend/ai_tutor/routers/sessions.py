from fastapi import APIRouter, HTTPException, Depends, Request
try:
    from supabase import Client
except Exception:  # pragma: no cover - optional dependency
    from typing import Any as Client
try:
    from gotrue.types import User  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    from typing import Any as User
from uuid import UUID
from typing import Optional, List, Dict as TDict

from ai_tutor.session_manager import SessionManager
from ai_tutor.dependencies import get_supabase_client  # Get supabase client dependency
from ai_tutor.auth import verify_token  # Get auth dependency
from ai_tutor.api_models import SessionResponse

router = APIRouter()
session_manager = SessionManager()

@router.post(
    "/sessions",
    response_model=SessionResponse,
    status_code=201,
    summary="Create New Tutoring Session",
    tags=["Session Management"]
)
async def create_new_session(
    request: Request,
    supabase: Client = Depends(get_supabase_client)
):
    """
    Creates a new tutoring session.

    Optionally links the session to a folder if `folder_id` is provided in the JSON body.
    """
    # Retrieve the authenticated user
    user: User = request.state.user

    # Parse incoming JSON body
    try:
        body = await request.json()
    except Exception:
        body = {}

    # Extract and validate folder_id if present
    folder_id = None
    if isinstance(body, dict) and 'folder_id' in body:
        folder_str = body.get('folder_id')
        if folder_str:
            try:
                folder_id = UUID(folder_str)
            except Exception:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid folder_id format. Must be a UUID string."
                )
            # Placeholder: verify user owns this folder
            print(f"Verifying ownership for folder: {folder_id}")

    # Create session through SessionManager
    session_id = await session_manager.create_session(
        supabase,
        user.id,
        folder_id
    )

    # Return raw JSON without Pydantic validation
    return {"session_id": str(session_id)}

# ===========================================================
# Phase-2 History & Whiteboard Retrieval Endpoints
# ===========================================================

@router.get(
    "/sessions/{session_id}/messages",
    summary="Paginated chat history for a session",
    tags=["Session Management"],
)
async def get_session_messages(
    request: Request,
    session_id: UUID,
    before_turn_no: Optional[int] = None,
    limit: int = 50,
    supabase: Client = Depends(get_supabase_client),
):
    """Return up to ``limit`` chat messages *before* ``before_turn_no``.

    Parameters
    ----------
    before_turn_no : Optional[int]
        Fetch messages with ``turn_no`` strictly **less than** this value.  If
        omitted, the newest ``limit`` messages are returned.
    limit : int
        Maximum number of messages to return.  Capped at 100 to avoid large
        payloads.
    """

    # --- Safety guards ---------------------------------------------------- #
    MAX_LIMIT = 100
    if limit <= 0:
        limit = 20  # sane default
    if limit > MAX_LIMIT:
        limit = MAX_LIMIT

    # NOTE: RLS on ``session_messages`` already guarantees that the authed
    # user can only access their own session rows.  We *still* attach the user
    # to request.state for parity with other endpoints that rely on it.
    user = request.state.user  # populated by verify_token dependency

    query = (
        supabase.table("session_messages")
        .select("turn_no, role, text, payload_json, whiteboard_snapshot_index")
        .eq("session_id", str(session_id))
    )

    if before_turn_no is not None:
        query = query.lt("turn_no", before_turn_no)  # STRICTLY before

    # Fetch newest first so that LIMIT works as expected, then reverse so the
    # list is chronological (oldest→newest) for the FE.
    resp = (
        query.order("turn_no", desc=True)  # newest → oldest
        .limit(limit)
        .execute()
    )

    rows: List[TDict] = resp.data or []
    rows.reverse()  # chronological order

    # For user rows we only return text; for assistant include payload_json.
    for r in rows:
        if r.get("role") == "user":
            r.pop("payload_json", None)

    return rows

@router.get(
    "/sessions/{session_id}/whiteboard_state_at_turn",
    summary="Whiteboard actions up to a given snapshot index",
    tags=["Session Management"],
)
async def get_whiteboard_state(
    request: Request,
    session_id: UUID,
    target_snapshot_index: int,
    supabase: Client = Depends(get_supabase_client),
):
    """Return concatenated whiteboard actions for all snapshots with
    ``snapshot_index`` ≤ *target_snapshot_index*.
    """

    if target_snapshot_index < 0:
        raise HTTPException(status_code=400, detail="target_snapshot_index must be non-negative")

    user = request.state.user  # Access to ensure verify_token populated it

    resp = (
        supabase.table("whiteboard_snapshots")
        .select("snapshot_index, actions_json")
        .eq("session_id", str(session_id))
        .lte("snapshot_index", target_snapshot_index)
        .order("snapshot_index", desc=False)
        .execute()
    )

    rows = resp.data or []
    actions: List[TDict] = []
    for row in rows:
        actions.extend(row.get("actions_json") or [])

    return {
        "target_snapshot_index": target_snapshot_index,
        "whiteboard_actions": actions,
    }

# Removed the duplicate /sessions endpoint
# @router.post(
#     "/sessions",
#     response_model=None,
#     summary="Create New Tutoring Session",
#     tags=["Session Management"]
# )
# async def create_new_session(
#     request: Request, # Access user from request state
#     supabase: Client = Depends(get_supabase_client)
# ):
#     user: User = request.state.user # Get user from verified token
#     # TODO: Verify user owns the folder_id before creating session (or rely on FK constraint/RLS)
#     session_id: UUID = await session_manager.create_session(supabase, user.id)
#     return {"session_id": str(session_id)} 