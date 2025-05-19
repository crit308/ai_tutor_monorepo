from typing import List, Dict, Any

from ai_tutor.skills import skill
from ai_tutor.services import layout_allocator as _alloc


@skill
async def draw_axis_actions(ctx: Any, **kwargs) -> List[Dict[str, Any]]:
    axis_id: str = kwargs.get("axis_id", "axis-1")
    width: int = kwargs.get("width", 250)
    height: int = kwargs.get("height", 200)
    show_arrows: bool = kwargs.get("show_arrows", True)
    label_x: str = kwargs.get("label_x", "X")
    label_y: str = kwargs.get("label_y", "Y")

    # Reserve space – include some padding
    PADDING = 40
    placement = await _alloc.reserve_region(
        session_id=str(ctx.session_id),
        requested_width=width + PADDING,
        requested_height=height + PADDING,
        strategy="flow",
        group_id=axis_id,
    )
    if placement is None:
        raise RuntimeError("draw_axis_actions: allocator returned no space")

    start_x = placement["x"] + 20
    start_y = placement["y"] + height  # position origin bottom-left of reserved box

    actions: List[Dict[str, Any]] = []

    # X-axis line
    actions.append(
        {
            "id": f"{axis_id}-x-line",
            "kind": "line",
            "points": [start_x, start_y, start_x + width, start_y],
            "stroke": "#000",
            "strokeWidth": 2,
            "metadata": {"source": "assistant", "role": "axis_x", "axis_id": axis_id},
        }
    )

    # Y-axis line
    actions.append(
        {
            "id": f"{axis_id}-y-line",
            "kind": "line",
            "points": [start_x, start_y, start_x, start_y - height],
            "stroke": "#000",
            "strokeWidth": 2,
            "metadata": {"source": "assistant", "role": "axis_y", "axis_id": axis_id},
        }
    )

    if show_arrows:
        # Arrow heads – simple small lines
        actions.append(
            {
                "id": f"{axis_id}-x-arrow",
                "kind": "line",
                "points": [start_x + width, start_y, start_x + width - 10, start_y - 5],
                "stroke": "#000",
                "strokeWidth": 2,
                "metadata": {"source": "assistant", "role": "axis_x_arrow", "axis_id": axis_id},
            }
        )
        actions.append(
            {
                "id": f"{axis_id}-x-arrow2",
                "kind": "line",
                "points": [start_x + width, start_y, start_x + width - 10, start_y + 5],
                "stroke": "#000",
                "strokeWidth": 2,
                "metadata": {"source": "assistant", "role": "axis_x_arrow", "axis_id": axis_id},
            }
        )
        actions.append(
            {
                "id": f"{axis_id}-y-arrow",
                "kind": "line",
                "points": [start_x, start_y - height, start_x - 5, start_y - height + 10],
                "stroke": "#000",
                "strokeWidth": 2,
                "metadata": {"source": "assistant", "role": "axis_y_arrow", "axis_id": axis_id},
            }
        )
        actions.append(
            {
                "id": f"{axis_id}-y-arrow2",
                "kind": "line",
                "points": [start_x, start_y - height, start_x + 5, start_y - height + 10],
                "stroke": "#000",
                "strokeWidth": 2,
                "metadata": {"source": "assistant", "role": "axis_y_arrow", "axis_id": axis_id},
            }
        )

    # Axis labels
    actions.append(
        {
            "id": f"{axis_id}-label-x",
            "kind": "text",
            "x": start_x + width + 10,
            "y": start_y - 5,
            "text": label_x,
            "fontSize": 14,
            "fill": "#000000",
            "metadata": {"source": "assistant", "role": "axis_label_x", "axis_id": axis_id},
        }
    )
    actions.append(
        {
            "id": f"{axis_id}-label-y",
            "kind": "text",
            "x": start_x - 10,
            "y": start_y - height - 15,
            "text": label_y,
            "fontSize": 14,
            "fill": "#000000",
            "metadata": {"source": "assistant", "role": "axis_label_y", "axis_id": axis_id},
        }
    )

    return actions 