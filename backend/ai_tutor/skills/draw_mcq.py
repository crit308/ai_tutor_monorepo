from typing import List, Dict, Any, Optional

from ai_tutor.skills import skill
from ai_tutor.agents.models import QuizQuestion
from ai_tutor.services import layout_allocator as _alloc
from ai_tutor.services import layout_templates as _template_resolver
import logging

log = logging.getLogger(__name__)

@skill
async def draw_mcq_actions(ctx: Any, **kwargs) -> List[Dict[str, Any]]:
    """Generate CanvasObjectSpecs for a multiple-choice question.

    If template_name and zone_name are provided in kwargs, it will attempt to place
    the MCQ within that zone using percentage coordinates. Otherwise, it falls back
    to the Phase-2 layout allocator for absolute positioning.

    Parameters (passed as keyword args by the executor):
    • question (QuizQuestion – required)
    • question_id (str – optional, auto-generated if absent)
    • template_name (str – optional)
    • zone_name (str – optional, requires template_name)
    """

    question: QuizQuestion | None = kwargs.get("question")
    if question is None:
        raise ValueError("draw_mcq_actions: 'question' argument missing")

    question_id: str = kwargs.get("question_id") or "q1"
    template_name: Optional[str] = kwargs.get("template_name")
    zone_name: Optional[str] = kwargs.get("zone_name")

    actions: List[Dict[str, Any]] = []

    # Constants for layout (can be adjusted)
    # These will be used for relative spacing within the zone or allocated block
    QUESTION_TEXT_HEIGHT_PCT_OF_ZONE = 0.25  # e.g., question text takes top 25% of the zone height
    OPTIONS_START_Y_PCT_OF_ZONE = 0.30     # e.g., options start 30% down from the zone top
    OPTION_HEIGHT_PCT_OF_ZONE = 0.15       # Max height for one option row (text + radio)
    OPTIONS_AREA_HEIGHT_PCT_OF_ZONE = 1.0 - OPTIONS_START_Y_PCT_OF_ZONE # Remaining height for all options
    
    RADIO_RADIUS_ABS = 8 # Absolute radius for radio buttons, can be scaled if needed
    OPTION_X_OFFSET_PCT = 0.02 # Small indent for options within the zone/block
    OPTION_TEXT_X_OFFSET_PCT = 0.05 # Indent for option text from zone/block left

    if template_name and zone_name:
        log.info(f"draw_mcq_actions: Attempting to use template '{template_name}' zone '{zone_name}' for MCQ {question_id}")
        zone_coords = _template_resolver.resolve_zone(template_name, zone_name)

        if zone_coords:
            log.info(f"Resolved zone '{zone_name}' to {zone_coords}. Placing MCQ with percentage coordinates within this zone.")
            base_x_pct = zone_coords["xPct"]
            base_y_pct = zone_coords["yPct"]
            zone_width_pct = zone_coords["widthPct"]
            zone_height_pct = zone_coords["heightPct"]

            # Question Text (relative to zone)
            actions.append({
                "id": f"mcq-{question_id}-text",
                "kind": "text",
                "text": question.question,
                "xPct": base_x_pct, 
                "yPct": base_y_pct,
                "widthPct": zone_width_pct,
                "heightPct": zone_height_pct * QUESTION_TEXT_HEIGHT_PCT_OF_ZONE,
                "fontSize": 18, # Consider making this relative or configurable too
                "fill": "#000000",
                "metadata": {"source": "assistant", "role": "question", "question_id": question_id, "groupId": question_id},
            })

            current_y_offset_pct = zone_height_pct * OPTIONS_START_Y_PCT_OF_ZONE 
            # Calculate height for each option dynamically if possible, or use a fixed percentage of zone
            num_options = len(question.options)
            single_option_total_h_pct = (zone_height_pct * OPTIONS_AREA_HEIGHT_PCT_OF_ZONE) / num_options if num_options > 0 else 0
            # Ensure option height is not excessively large if few options in a large zone
            single_option_draw_h_pct = min(single_option_total_h_pct, zone_height_pct * OPTION_HEIGHT_PCT_OF_ZONE) 

            for i, option_text in enumerate(question.options):
                option_id = i
                option_y_pct = base_y_pct + current_y_offset_pct

                actions.append({
                    "id": f"mcq-{question_id}-opt-{option_id}-radio",
                    "kind": "circle",
                    "xPct": base_x_pct + (zone_width_pct * OPTION_X_OFFSET_PCT), 
                    "yPct": option_y_pct + (single_option_draw_h_pct / 2), # Center radio in its allocated space
                    # Radius for circle is absolute, but its position is Pct. Consider if radius needs to be Pct of zone_width/height.
                    "radius": RADIO_RADIUS_ABS, 
                    "stroke": "#555555", "strokeWidth": 1, "fill": "#FFFFFF",
                    "metadata": {"source": "assistant", "role": "option_selector", "question_id": question_id, "option_id": option_id, "groupId": question_id},
                })
                actions.append({
                    "id": f"mcq-{question_id}-opt-{option_id}-text",
                    "kind": "text",
                    "text": f"{chr(65 + i)}. {option_text}",
                    "xPct": base_x_pct + (zone_width_pct * OPTION_TEXT_X_OFFSET_PCT),
                    "yPct": option_y_pct, # Align text top with its allocated space, can adjust yPct for centering with radio
                    "widthPct": zone_width_pct * (1.0 - OPTION_TEXT_X_OFFSET_PCT),
                    "heightPct": single_option_draw_h_pct,
                    "fontSize": 16, "fill": "#333333",
                    "metadata": {"source": "assistant", "role": "option_label", "question_id": question_id, "option_id": option_id, "groupId": question_id},
                })
                current_y_offset_pct += single_option_total_h_pct
            
            return actions # Return actions based on template/zone
        else:
            log.warning(f"draw_mcq_actions: Failed to resolve template '{template_name}' zone '{zone_name}'. Falling back to allocator.")
    
    # Fallback to original allocator logic if no template/zone or resolution failed
    log.info(f"draw_mcq_actions: Using layout allocator for MCQ {question_id} (no valid template/zone provided).")
    QUESTION_WIDTH = 700
    OPTION_SPACING = 40
    V_PADDING = 20

    block_height = 100 + len(question.options) * OPTION_SPACING + V_PADDING

    placement = await _alloc.reserve_region(
        session_id=str(ctx.session_id),
        requested_width=QUESTION_WIDTH,
        requested_height=block_height,
        strategy="flow",
        group_id=question_id,
    )
    if placement is None:
        raise RuntimeError("draw_mcq_actions: allocator returned no space")

    QUESTION_X = placement["x"]
    QUESTION_Y = placement["y"]

    OPTION_START_Y = QUESTION_Y + 50
    OPTION_X_OFFSET = 20
    OPTION_TEXT_X_OFFSET = 25
    OPTION_RADIO_RADIUS = 8

    # Question Text
    actions.append({
        "id": f"mcq-{question_id}-text",
        "kind": "text",
        "x": QUESTION_X,
        "y": QUESTION_Y,
        "text": question.question,
        "fontSize": 18,
        "fill": "#000000",
        "width": QUESTION_WIDTH,
        "metadata": {
            "source": "assistant",
            "role": "question",
            "question_id": question_id,
            "groupId": question_id,
        },
    })

    current_y = OPTION_START_Y
    for i, option_text in enumerate(question.options):
        option_id = i
        # Radio button
        actions.append({
            "id": f"mcq-{question_id}-opt-{option_id}-radio",
            "kind": "circle",
            "x": QUESTION_X + OPTION_X_OFFSET,
            "y": current_y + OPTION_RADIO_RADIUS,
            "radius": OPTION_RADIO_RADIUS,
            "stroke": "#555555",
            "strokeWidth": 1,
            "fill": "#FFFFFF",
            "metadata": {
                "source": "assistant",
                "role": "option_selector",
                "question_id": question_id,
                "option_id": option_id,
                "groupId": question_id,
            },
        })
        # Option text
        actions.append({
            "id": f"mcq-{question_id}-opt-{option_id}-text",
            "kind": "text",
            "x": QUESTION_X + OPTION_X_OFFSET + OPTION_TEXT_X_OFFSET,
            "y": current_y + OPTION_RADIO_RADIUS,
            "text": f"{chr(65 + i)}. {option_text}",
            "fontSize": 16,
            "fill": "#333333",
            "metadata": {
                "source": "assistant",
                "role": "option_label",
                "question_id": question_id,
                "option_id": option_id,
                "groupId": question_id,
            },
        })
        current_y += OPTION_SPACING

    return actions 