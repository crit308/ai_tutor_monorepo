import json
import logging
from typing import Dict, Optional, Any

log = logging.getLogger(__name__)

# Simple in-memory store for templates.
# In the future, this could load from JSON files in a directory.
_LAYOUT_TEMPLATES: Dict[str, Dict[str, Dict[str, float]]] = {
    "default_board": {
        "question_area": {"xPct": 0.05, "yPct": 0.05, "widthPct": 0.9, "heightPct": 0.2},
        "options_area": {"xPct": 0.05, "yPct": 0.30, "widthPct": 0.9, "heightPct": 0.4}, # Adjusted yPct
        "explanation_area": {"xPct": 0.05, "yPct": 0.75, "widthPct": 0.9, "heightPct": 0.2},
        "side_panel_top": {"xPct": 0.75, "yPct": 0.05, "widthPct": 0.20, "heightPct": 0.40},
        "side_panel_bottom": {"xPct": 0.75, "yPct": 0.50, "widthPct": 0.20, "heightPct": 0.45},
        "center_large": {"xPct": 0.2, "yPct": 0.2, "widthPct": 0.6, "heightPct": 0.6},
        "full_width_top_banner": {"xPct": 0.0, "yPct": 0.0, "widthPct": 1.0, "heightPct": 0.1},
        "full_width_bottom_banner": {"xPct": 0.0, "yPct": 0.9, "widthPct": 1.0, "heightPct": 0.1},
        "alt_question_spot": {"xPct": 0.05, "yPct": 0.70, "widthPct": 0.4, "heightPct": 0.25}
    },
    "two_column_equal": {
        "left_column": {"xPct": 0.02, "yPct": 0.02, "widthPct": 0.47, "heightPct": 0.96},
        "right_column": {"xPct": 0.51, "yPct": 0.02, "widthPct": 0.47, "heightPct": 0.96},
    }
    # Add more templates as needed
}

def resolve_zone(template_name: str, zone_name: str) -> Optional[Dict[str, float]]:
    """
    Resolves a named zone within a given layout template to its percentage coordinates.

    Args:
        template_name: The name of the layout template (e.g., "default_board").
        zone_name: The name of the zone within the template (e.g., "question_area").

    Returns:
        A dictionary with xPct, yPct, widthPct, heightPct if found, else None.
    """
    template = _LAYOUT_TEMPLATES.get(template_name)
    if not template:
        log.warning(f"Layout template '{template_name}' not found.")
        return None
    
    zone_coords = template.get(zone_name)
    if not zone_coords:
        log.warning(f"Zone '{zone_name}' not found in template '{template_name}'.")
        return None
    
    log.info(f"Resolved zone '{zone_name}' in template '{template_name}' to: {zone_coords}")
    return zone_coords

# Example of how to load from a JSON file (for future expansion)
# def load_templates_from_file(file_path: str) -> Dict[str, Any]:
#     try:
#         with open(file_path, 'r') as f:
#             return json.load(f)
#     except FileNotFoundError:
#         log.error(f"Layout template file not found: {file_path}")
#         return {}
#     except json.JSONDecodeError:
#         log.error(f"Error decoding JSON from layout template file: {file_path}")
#         return {}

# To use file-based loading:
# _LAYOUT_TEMPLATES = load_templates_from_file("path/to/your/layout_templates.json") 