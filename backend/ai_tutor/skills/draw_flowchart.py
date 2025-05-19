from typing import List, Dict, Any, Sequence

from ai_tutor.skills import skill
from ai_tutor.services import layout_allocator as _alloc


@skill
async def draw_flowchart_actions(ctx: Any, **kwargs) -> List[Dict[str, Any]]:
    """Generate a left-to-right flowchart, automatically placed by allocator.

    kwargs expected:
      • steps (Sequence[str]) – list of step labels.
      • chart_id (str, optional)
    """

    steps: Sequence[str] | None = kwargs.get("steps")
    if not steps:
        raise ValueError("draw_flowchart_actions: 'steps' argument missing or empty")

    chart_id: str = kwargs.get("chart_id") or "flow-1"
    box_width = 140
    box_height = 60
    h_gap = 80

    total_width = len(steps) * box_width + (len(steps) - 1) * h_gap
    total_height = box_height + 40  # arrow space

    placement = await _alloc.reserve_region(
        session_id=str(ctx.session_id),
        requested_width=total_width,
        requested_height=total_height,
        strategy="flow",
        group_id=chart_id,
    )
    if placement is None:
        raise RuntimeError("draw_flowchart_actions: allocator returned no space")

    start_x = placement["x"]
    start_y = placement["y"]

    actions: List[Dict[str, Any]] = []

    # Draw boxes
    for i, label in enumerate(steps):
        x = start_x + i * (box_width + h_gap)
        y = start_y
        actions.append(
            {
                "id": f"{chart_id}-box-{i}",
                "kind": "rect",
                "x": x,
                "y": y,
                "width": box_width,
                "height": box_height,
                "fill": "#E8F5E9",
                "stroke": "#1B5E20",
                "strokeWidth": 1,
                "metadata": {"source": "assistant", "role": "flow_box", "chart_id": chart_id, "step": i, "groupId": chart_id},
            }
        )
        actions.append(
            {
                "id": f"{chart_id}-box-{i}-text",
                "kind": "text",
                "x": x + box_width / 2,
                "y": y + box_height / 2,
                "text": label,
                "fontSize": 14,
                "fill": "#1B5E20",
                "textAnchor": "middle",
                "metadata": {"source": "assistant", "role": "flow_box_text", "chart_id": chart_id, "step": i, "groupId": chart_id},
            }
        )

    # Draw arrows between boxes
    for i in range(len(steps) - 1):
        x1 = start_x + i * (box_width + h_gap)
        x2 = start_x + (i + 1) * (box_width + h_gap)
        y_mid = start_y + box_height / 2
        actions.append(
            {
                "id": f"{chart_id}-arrow-{i}-{i+1}",
                "kind": "line",
                "points": [x1 + box_width, y_mid, x2 - 10, y_mid],
                "stroke": "#000000",
                "strokeWidth": 2,
                "metadata": {"source": "assistant", "role": "flow_arrow", "chart_id": chart_id, "from": i, "to": i + 1, "groupId": chart_id},
            }
        )

    return actions 