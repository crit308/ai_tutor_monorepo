from typing import List, Dict, Any

from ai_tutor.skills import skill


@skill
async def clear_whiteboard() -> List[Dict[str, Any]]:
    """Returns a whiteboard action list containing only a 'CLEAR_CANVAS' action.

    This signals the frontend to clear all existing elements drawn by the assistant.
    """
    return [
        {
            "id": "global-clear-0", # Changed ID to reflect new type
            "type": "CLEAR_CANVAS",  # Changed from "reset" to "CLEAR_CANVAS"
            "scope": "all", # Added scope, defaulting to all
            "metadata": {"source": "assistant", "reason": "new_diagram_or_action"}, # Updated reason
        }
    ] 