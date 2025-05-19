from typing import List, Dict, Any

from ai_tutor.skills import skill
from ai_tutor.services import layout_allocator as _alloc


@skill
async def draw_diagram_actions(ctx: Any, **kwargs) -> List[Dict[str, Any]]:
    """Return CanvasObjectSpecs for a simple labelled circle diagram placed
    via the Phase-2 layout allocator.

    Args accepted (kwargs):
      • topic (str) – diagram subject
      • description (str) – currently unused stub field
    """

    topic: str | None = kwargs.get("topic")
    if topic is None:
        raise ValueError("draw_diagram_actions: 'topic' argument missing")

    DIAG_WIDTH = 260
    DIAG_HEIGHT = 260

    placement = await _alloc.reserve_region(
        session_id=str(ctx.session_id),
        requested_width=DIAG_WIDTH,
        requested_height=DIAG_HEIGHT,
        strategy="flow",
        group_id=f"diagram-{topic}",
    )
    if placement is None:
        raise RuntimeError("draw_diagram_actions: allocator returned no space")

    center_x = placement["x"] + DIAG_WIDTH // 2
    center_y = placement["y"] + DIAG_HEIGHT // 2

    return [
        {
            "id": f"diagram-{topic}-circle",
            "kind": "circle",
            "x": center_x,
            "y": center_y,
            "radius": 60,
            "stroke": "#1976D2",
            "strokeWidth": 2,
            "fill": "#E3F2FD",
            "metadata": {"source": "assistant", "role": "main_shape", "topic": topic, "groupId": f"diagram-{topic}"},
        },
        {
            "id": f"diagram-{topic}-label",
            "kind": "text",
            "x": center_x,
            "y": center_y,
            "text": topic,
            "fontSize": 20,
            "fill": "#1976D2",
            "metadata": {"source": "assistant", "role": "label", "topic": topic, "groupId": f"diagram-{topic}"},
        },
    ] 