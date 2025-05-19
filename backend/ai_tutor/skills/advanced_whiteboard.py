from typing import Any, Dict, Optional

from pydantic import BaseModel, Field, ValidationError

from ai_tutor.skills import skill
from ai_tutor.exceptions import ToolInputError
from ai_tutor.skills.drawing_tools import style_token, PaletteColor


class HighlightObjectArgs(BaseModel):
    object_id: str = Field(..., min_length=1, description="ID of the object to highlight on the whiteboard")
    color_token: PaletteColor = Field(
        default="accent",
        description="Semantic colour token to use for the highlight overlay",
    )
    pulse: bool = Field(
        default=False,
        description="Whether the highlight should pulse / animate on the frontend",
    )


class ShowPointerArgs(BaseModel):
    x: int = Field(..., description="X-coordinate (canvas px) for the pointer tip")
    y: int = Field(..., description="Y-coordinate (canvas px) for the pointer tip")
    pointer_id: Optional[str] = Field(
        default=None,
        description="Optional stable ID so successive calls can move the same visual pointer",
    )
    duration_ms: Optional[int] = Field(
        default=3000,
        gt=0,
        description="How long the pointer should stay visible (ms). 0 = until next call.",
    )
    color_token: PaletteColor = Field(
        default="primary",
        description="Semantic colour token used for the pointer fill/stroke",
    )


# --------------------------------------------------------------------------- #
# Skill Implementations
# --------------------------------------------------------------------------- #


@skill
async def highlight_object(ctx: Any, **kwargs) -> Dict[str, Any]:
    """Return a WhiteboardAction that visually highlights a specific object.

    Example output (sent through websocket to FE)::

        {
            "type": "HIGHLIGHT_OBJECT",
            "targetObjectId": "rect-123",
            "color": "#FF5722",
            "pulse": true
        }
    """
    try:
        args = HighlightObjectArgs(**kwargs)
    except ValidationError as e:
        raise ToolInputError(f"Invalid arguments for highlight_object: {e}")

    color_hex = await style_token.__original_func__(token=args.color_token)
    return {
        "type": "HIGHLIGHT_OBJECT",
        "targetObjectId": args.object_id,
        "color": color_hex,
        "pulse": args.pulse,
    }


@skill
async def show_pointer_at(ctx: Any, **kwargs) -> Dict[str, Any]:
    """Display an *AI pointer* on the canvas to draw the learner's attention.

    The FE should render a cursor/laser-pointer icon at (x, y) that fades after
    ``duration_ms``.  Reusing the same ``pointer_id`` lets the AI move an
    existing pointer instead of spawning a new one.
    """
    try:
        args = ShowPointerArgs(**kwargs)
    except ValidationError as e:
        raise ToolInputError(f"Invalid arguments for show_pointer_at: {e}")

    color_hex = await style_token.__original_func__(token=args.color_token)
    return {
        "type": "SHOW_POINTER_AT",
        "x": args.x,
        "y": args.y,
        **({"pointerId": args.pointer_id} if args.pointer_id else {}),
        "durationMs": args.duration_ms,
        "color": color_hex,
    }
