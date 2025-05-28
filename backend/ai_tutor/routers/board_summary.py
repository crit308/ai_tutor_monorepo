from __future__ import annotations

"""
Board Summary API Endpoint

This module provides a GET endpoint that returns a concise digest of the current
whiteboard state for a given session. The summary includes:

  • Object counts by kind (text, rect, etc.) and owner (assistant, user)
  • Learner-generated question tags with their coordinates
  • Concept clusters with bounding boxes for objects sharing the same concept

The endpoint path mirrors other Session-scoped resources::

    GET /api/v1/sessions/{session_id}/board_summary

Return payload schema (subject to change as we iterate):
```json
{
  "counts": {
      "by_kind": {"text": 12, "rect": 3, ...},
      "by_owner": {"assistant": 15, "user": 4}
  },
  "learner_question_tags": [
      {"id": "qtag-123", "x": 120, "y": 200}
  ],
  "concept_clusters": [
      {"concept": "water_cycle", "bbox": [x1, y1, x2, y2], "count": 8 }
  ]
}
```
"""

import logging
import os
from uuid import UUID
import httpx

from fastapi import APIRouter, Depends, HTTPException, Request, status
try:
    from supabase import Client
except Exception:  # pragma: no cover - optional dependency
    from typing import Any as Client

from ai_tutor.dependencies import get_supabase_client
from ai_tutor.auth import verify_token

log = logging.getLogger(__name__)

router = APIRouter(tags=["Whiteboard"])

# Convex HTTP API configuration
CONVEX_SITE_URL = os.environ.get("CONVEX_SITE_URL", "https://your-convex-deployment.convex.site")


@router.get(
    "/sessions/{session_id}/board_summary",
    summary="Return a concise summary of the whiteboard for the given session",
)
async def get_board_summary(
    request: Request,
    session_id: UUID,
    supabase: Client = Depends(get_supabase_client),
):
    """Return an aggregated digest of the current whiteboard state.

    The caller must be the owner of *session_id* (enforced via RLS + explicit
    check for clarity).
    """

    # ------------------------------------------------------------------
    # 1️⃣  Authorisation – ensure the authed user owns this session
    # ------------------------------------------------------------------
    user = request.state.user  # Populated by `verify_token` dependency

    # Although Supabase RLS safeguards apply to table selects, we perform an
    # explicit check for parity with the WebSocket authorisation logic.
    try:
        chk = (
            supabase.table("sessions")
            .select("id")
            .eq("id", str(session_id))
            .eq("user_id", str(user.id))
            .maybe_single()
            .execute()
        )
        if not chk.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        log.error("[board_summary] DB lookup error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal error")

    # ------------------------------------------------------------------
    # 2️⃣  Call Convex getBoardSummary function via HTTP API
    # ------------------------------------------------------------------
    try:
        async with httpx.AsyncClient() as client:
            # Get auth token from request headers
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
            else:
                raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
            
            # Call Convex function
            response = await client.post(
                f"{CONVEX_SITE_URL}/api/query",
                json={
                    "path": "database/whiteboard:getBoardSummary",
                    "args": {"sessionId": str(session_id)},
                    "format": "json"
                },
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                },
                timeout=10.0
            )
            
            if response.status_code == 200:
                result = response.json()
                return result
            elif response.status_code == 404:
                # No whiteboard content yet – return empty digest
                return {
                    "counts": {"by_kind": {}, "by_owner": {}},
                    "learner_question_tags": [],
                    "concept_clusters": [],
                }
            else:
                log.error("[board_summary] Convex API error: %s %s", response.status_code, response.text)
                raise HTTPException(status_code=500, detail="Failed to fetch board summary")
                
    except httpx.TimeoutException:
        log.error("[board_summary] Convex API timeout")
        raise HTTPException(status_code=500, detail="Request timeout")
    except Exception as exc:  # pragma: no cover
        log.error("[board_summary] Failed to call Convex API: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal error") 