import logging
from uuid import UUID
from typing import Optional, Dict, Any
from ai_tutor.dependencies import get_convex_client  # Use Convex for logging
from ai_tutor.context import TutorContext # For type hinting

logger = logging.getLogger(__name__)

async def log_interaction(
    ctx: TutorContext, # Pass context to get IDs
    role: str, # 'user' or 'agent'
    content: str, # Text or JSON string of content
    content_type: str, # e.g., 'text', 'explanation', 'question'
    event_type: Optional[str] = None # e.g., 'user_message', 'next', 'answer'
    # Add trace_id if available from context or runner
):
    """Logs a user or agent interaction to the database."""
    if not ctx or not ctx.session_id or not ctx.user_id:
        logger.warning("Attempted to log interaction without valid context.")
        return

    log_data = {
        "session_id": str(ctx.session_id),
        "user_id": str(ctx.user_id),
        "role": role,
        "content": content, # Store potentially large text/JSON
        "content_type": content_type,
        "event_type": event_type,
        # "trace_id": ctx.current_trace_id # If tracking trace IDs
    }
    try:
        convex = await get_convex_client()
        await convex.mutation("logInteraction", log_data)
        logger.debug(
            f"Interaction logged successfully for session {ctx.session_id}"
        )
    except Exception as e:
        logger.error(
            f"Exception while logging interaction for session {ctx.session_id}: {e}",
            exc_info=True,
        )

