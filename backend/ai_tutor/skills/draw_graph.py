from ai_tutor.skills import skill
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel, Field, ValidationError
from ai_tutor.exceptions import ToolInputError
import logging  # Add logging
from ai_tutor.context import TutorContext  # For type hint
from agents.run_context import RunContextWrapper  # For type hint
from ai_tutor.api_models import MessageResponse # Added MessageResponse
from .drawing_tools import clear_board # Import clear_board

logger = logging.getLogger(__name__)  # Add logger

class NodeSpec(BaseModel):
    id: str = Field(..., min_length=1)
    width: int = Field(..., gt=0)
    height: int = Field(..., gt=0)
    label: Optional[str] = None

class EdgeSpec(BaseModel):
    id: str = Field(..., min_length=1)
    source: str = Field(..., min_length=1) # Source node ID
    target: str = Field(..., min_length=1) # Target node ID
    label: Optional[str] = None

class DrawGraphArgs(BaseModel):
    graph_id: str = Field(..., min_length=1)
    nodes: List[NodeSpec]
    edges: List[EdgeSpec]
    layout_type: str = 'elk'
    x: Optional[int] = None
    y: Optional[int] = None
    xPct: Optional[float] = None
    yPct: Optional[float] = None

@skill
async def draw_graph(
    ctx: Optional[Any] = None,  # Context is useful but optional to prevent invocation errors
    **kwargs: Any,
) -> Tuple[MessageResponse, List[Dict[str, Any]]]: # Changed return type hint
    """Generates the spec to automatically lay out and draw a graph. Clears board first."""
    try:
        # Validate using kwargs directly
        validated_args = DrawGraphArgs(**kwargs)
        logger.info(f"Validated args for draw_graph: {validated_args.model_dump()}")
    except ValidationError as e:
        logger.error(f"Input validation failed for draw_graph: {e}")
        raise ToolInputError(f"Invalid arguments for draw_graph: {e}") from e

    # 1. Prepare the clear board action
    # clear_board is a FunctionTool, we need to call its underlying function.
    # It returns a list of actions (typically one action to reset the board).
    original_clear_board_func = getattr(clear_board, "__original_func__", clear_board)
    if not callable(original_clear_board_func):
        logger.error("clear_board.__original_func__ is not callable.")
        # Fallback or raise an error - for now, log and proceed without clear
        clear_action_list = []
    else:
        try:
            # Assuming clear_board() returns the action list directly, not a tuple
            # If clear_board itself returns (MessageResponse, List[Actions]), we only need the actions.
            # Based on drawing_tools.py, clear_board returns List[Dict[str,Any]]
            clear_board_result = await original_clear_board_func()
            if isinstance(clear_board_result, tuple) and len(clear_board_result) == 2 and isinstance(clear_board_result[1], list):
                clear_action_list = clear_board_result[1]
            elif isinstance(clear_board_result, list): # If it somehow returns just the list
                clear_action_list = clear_board_result
            else:
                logger.warning("clear_board returned an unexpected type, proceeding without clear action.")
                clear_action_list = []
        except Exception as clear_err:
            logger.error(f"Error calling clear_board: {clear_err}", exc_info=True)
            clear_action_list = [] # Proceed without clear if it fails

    # 2. Prepare the graph spec
    graph_spec = {
        "id": validated_args.graph_id,
        "kind": "graph_layout",
        "metadata": {
            "id": validated_args.graph_id,
            "layoutSpec": {
                # Pydantic models need to be converted to dicts for JSON serialization
                "nodes": [node.model_dump() for node in validated_args.nodes],
                "edges": [edge.model_dump() for edge in validated_args.edges],
                "layoutType": validated_args.layout_type,
            }
        },
        # Make the graph object non-interactive by default
        "selectable": False,
        "evented": False,
        "hasControls": False,
        # Positional arguments
        **({"x": validated_args.x} if validated_args.x is not None else {}),
        **({"y": validated_args.y} if validated_args.y is not None else {}),
        **({"xPct": validated_args.xPct} if validated_args.xPct is not None else {}),
        **({"yPct": validated_args.yPct} if validated_args.yPct is not None else {}),
    }
    
    # 3. Construct the response
    message_text = f"Cleared the board and generated graph '{validated_args.graph_id}'."
    if not clear_action_list:
        message_text = f"Generated graph '{validated_args.graph_id}' (board not cleared due to an issue)."
        
    message = MessageResponse(message_text=message_text, message_type="status_update")
    
    # Combine clear actions with the add graph object action
    add_graph_action = {"type": "ADD_OBJECTS", "objects": [graph_spec]}
    all_whiteboard_actions = clear_action_list + [add_graph_action]
    
    return message, all_whiteboard_actions 