from typing import List, Dict, Any, Sequence

from ai_tutor.skills import skill
from ai_tutor.skills.utils.layout import grid_positions
from ai_tutor.services import layout_allocator as _alloc


@skill
async def draw_table_actions(ctx: Any, **kwargs) -> List[Dict[str, Any]]:
    headers: Sequence[str] = kwargs.get("headers") or []
    rows: Sequence[Sequence[str]] = kwargs.get("rows") or []
    cell_width: int = kwargs.get("cell_width", 140)
    cell_height: int = kwargs.get("cell_height", 40)
    col_gap: int = kwargs.get("col_gap", 10)
    row_gap: int = kwargs.get("row_gap", 10)
    table_id: str = kwargs.get("table_id", "table-1")

    if not headers:
        raise ValueError("draw_table_actions: 'headers' missing")

    n_cols = len(headers)
    n_rows = len(rows) + 1

    total_width = n_cols * cell_width + (n_cols - 1) * col_gap
    total_height = n_rows * cell_height + (n_rows - 1) * row_gap

    placement = await _alloc.reserve_region(
        session_id=str(ctx.session_id),
        requested_width=total_width,
        requested_height=total_height,
        strategy="flow",
        group_id=table_id,
    )
    if placement is None:
        raise RuntimeError("draw_table_actions: allocator returned no space")

    start_x = placement["x"]
    start_y = placement["y"]

    positions = grid_positions(
        n_cols,
        n_rows,
        start_x=start_x,
        start_y=start_y,
        cell_width=cell_width,
        cell_height=cell_height,
        col_gap=col_gap,
        row_gap=row_gap,
    )

    actions: List[Dict[str, Any]] = []

    # Draw header cells (simple bold text)
    for c, header in enumerate(headers):
        x, y = positions[c]
        actions.append(
            {
                "id": f"{table_id}-header-{c}",
                "kind": "rect",
                "x": x,
                "y": y,
                "width": cell_width,
                "height": cell_height,
                "fill": "#BBDEFB",
                "stroke": "#0D47A1",
                "strokeWidth": 1,
                "metadata": {"source": "assistant", "role": "table_header", "table_id": table_id, "col": c},
            }
        )
        actions.append(
            {
                "id": f"{table_id}-header-{c}-text",
                "kind": "text",
                "x": x + 10,
                "y": y + cell_height / 2,
                "text": str(header),
                "fontSize": 14,
                "fill": "#0D47A1",
                "metadata": {"source": "assistant", "role": "table_header_text", "table_id": table_id, "col": c},
            }
        )

    # Draw body cells
    for r, row_values in enumerate(rows):
        for c in range(n_cols):
            x, y = positions[(r + 1) * n_cols + c]
            text_value = str(row_values[c]) if c < len(row_values) else ""
            actions.append(
                {
                    "id": f"{table_id}-cell-{r}-{c}",
                    "kind": "rect",
                    "x": x,
                    "y": y,
                    "width": cell_width,
                    "height": cell_height,
                    "fill": "#FFFFFF",
                    "stroke": "#9E9E9E",
                    "strokeWidth": 1,
                    "metadata": {"source": "assistant", "role": "table_cell", "table_id": table_id, "row": r, "col": c},
                }
            )
            actions.append(
                {
                    "id": f"{table_id}-cell-{r}-{c}-text",
                    "kind": "text",
                    "x": x + 10,
                    "y": y + cell_height / 2,
                    "text": text_value,
                    "fontSize": 14,
                    "fill": "#000000",
                    "metadata": {"source": "assistant", "role": "table_cell_text", "table_id": table_id, "row": r, "col": c},
                }
            )

    return actions 