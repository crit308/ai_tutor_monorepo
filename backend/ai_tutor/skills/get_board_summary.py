from __future__ import annotations

"""ai_tutor/skills/get_board_summary.py

Phase-1 replacement for the old *get_board_state* skill.
Returns a concise, structured digest of the whiteboard so the LLM can
reason about what is currently on the board without receiving the full
object list.

The implementation calls the Convex getBoardSummary function via HTTP API
to get the current whiteboard state from the persistent Convex database.
"""

import logging
import os
from typing import Any, Dict
import httpx

from ai_tutor.skills import skill
from ai_tutor.context import TutorContext
from agents.run_context import RunContextWrapper

log = logging.getLogger(__name__)

# Convex HTTP API configuration
CONVEX_SITE_URL = os.environ.get("CONVEX_SITE_URL", "https://your-convex-deployment.convex.site")

@skill(name_override="get_board_summary")
async def get_board_summary_skill(ctx: RunContextWrapper[TutorContext]) -> Dict[str, Any]:
    """Return an LLM-friendly summary of the current whiteboard.

    The summary contains:
        counts.by_kind – number of objects per `kind`.
        counts.by_owner – number of objects grouped by metadata.source.
        learner_question_tags – list of question_tag objects placed by the learner.
        concept_clusters – bounding-boxes for objects that share the same
                            metadata.concept label.
    """

    session_id = ctx.context.session_id
    
    # Get auth token from context (assuming it's available)
    # Note: This might need adjustment based on how auth tokens are stored in the context
    auth_token = getattr(ctx.context, 'auth_token', None)
    if not auth_token:
        log.error("[get_board_summary] No auth token available in context")
        return {
            "error": "authentication_required",
            "detail": "No auth token available",
        }

    try:
        async with httpx.AsyncClient() as client:
            # Call Convex function
            response = await client.post(
                f"{CONVEX_SITE_URL}/api/query",
                json={
                    "path": "database/whiteboard:getBoardSummary",
                    "args": {"sessionId": str(session_id)},
                    "format": "json"
                },
                headers={
                    "Authorization": f"Bearer {auth_token}",
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
                log.error("[get_board_summary] Convex API error: %s %s", response.status_code, response.text)
                return {
                    "error": "convex_api_error",
                    "detail": f"HTTP {response.status_code}: {response.text}",
                }
                
    except httpx.TimeoutException:
        log.error("[get_board_summary] Convex API timeout")
        return {
            "error": "timeout",
            "detail": "Request to Convex API timed out",
        }
    except Exception as exc:
        log.error("[get_board_summary] Failed to call Convex API: %s", exc, exc_info=True)
        return {
            "error": "unexpected_error",
            "detail": str(exc),
        } 