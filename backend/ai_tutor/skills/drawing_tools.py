from __future__ import annotations

"""Generic low-level drawing helper skills.

These skills expose primitive whiteboard drawing capabilities (text, basic
shapes, colour tokens …) that higher-level tutors/agents can reuse when they
need *just* a textbox or rectangle rather than a full diagram/MCQ/table.

Phase-1 MVP keeps the logic intentionally simple:
• If the caller does not supply coordinates we fall back to a fixed layout
  stub so nothing crashes while a proper layout service is still under
  development.
• We do *not* attempt to detect collisions/overlap – that will be refined in
  Phase-2.

All functions are registered as ADK FunctionTools via the ``@skill`` decorator
from :pymod:`ai_tutor.skills`.
"""

from typing import List, Dict, Any, Optional, Tuple, Literal as TypingLiteral
import logging
import uuid

from ai_tutor.skills import skill  # Re-exported decorator
from ai_tutor.exceptions import ToolInputError
from pydantic import BaseModel, Field, ValidationError
from ai_tutor.api_models import MessageResponse, WhiteboardObjectCustomMetadata

# --- Import for the new 'draw' skill ---
# from .draw_diagram import draw_diagram_actions
from .layout_board_ops import add_objects_to_board

# --------------------------------------------------------------------------- #
# Internal helpers
# --------------------------------------------------------------------------- #

logger = logging.getLogger(__name__)

# Simple static colour palette that loosely mirrors the FE theme.
_PALETTE: dict[str, str] = {
    "default": "#000000",
    "primary": "#1976D2",  # Blue-600
    "accent": "#FF5722",   # Deep-orange-500
    "muted": "#9E9E9E",    # Grey-500
    "success": "#2ECC71",  # Green-400
    "error": "#E74C3C",    # Red-400
}

# Define a Literal type for Pydantic validation based on _PALETTE keys
PaletteColor = TypingLiteral["default", "primary", "accent", "muted", "success", "error"]

def _get_layout_position(w: int | None, h: int | None) -> Tuple[int, int]:
    """Very naïve placeholder until a real layout engine exists.

    For now we simply return a fixed offset so that something renders on the
    canvas.  In a later phase we will call a proper layout service.
    """
    return 100, 100


# --------------------------------------------------------------------------- #
# Pydantic Models for Skill Arguments
# --------------------------------------------------------------------------- #

# Define a UUID namespace for deterministic ID generation
ASSISTANT_DRAWING_NAMESPACE = uuid.UUID('a1e5a97a-7278-47ce-861d-80971e00de60')

class StyleTokenArgs(BaseModel):
    token: PaletteColor

class DrawTextArgs(BaseModel):
    id: Optional[str] = None
    text: str = Field(..., min_length=1)
    x: Optional[int] = None
    y: Optional[int] = None
    fontSize: Optional[int] = Field(default=None, gt=0)
    width: Optional[int] = Field(default=None, gt=0)
    color_token: PaletteColor = "default"
    custom_metadata: Optional[WhiteboardObjectCustomMetadata] = None

class PointSpec(BaseModel):
    x: int
    y: int

class DrawShapeArgs(BaseModel):
    id: Optional[str] = None
    kind: TypingLiteral["rect", "circle", "arrow"]
    x: Optional[int] = None
    y: Optional[int] = None
    w: Optional[int] = Field(default=None, gt=0)
    h: Optional[int] = Field(default=None, gt=0)
    radius: Optional[int] = Field(default=None, gt=0)
    points: Optional[List[PointSpec]] = None
    label: Optional[str] = None
    color_token: PaletteColor = "default"
    custom_metadata: Optional[WhiteboardObjectCustomMetadata] = None

# --------------------------------------------------------------------------- #
# Public skills
# --------------------------------------------------------------------------- #

@skill
async def style_token(**kwargs) -> str:
    """Resolve a semantic *token* (e.g. ``"primary"``) to a hex colour string.

    This utility is intentionally synchronous-like but kept ``async`` for a
    consistent skill interface.
    """
    try:
        validated_args = StyleTokenArgs(**kwargs)
    except ValidationError as e:
        raise ToolInputError(f"Invalid arguments for style_token: {e}")
    return _PALETTE.get(validated_args.token, _PALETTE["default"])


@skill
async def draw(ctx: Any, objects: List[Dict[str, Any]], **kwargs) -> Tuple[MessageResponse, List[Dict[str, Any]]]:
    """
    Draws a list of objects on the whiteboard by allocating space and adding them.
    'objects' should be a list of dictionaries, each conforming to PartialCanvasObjectSpec.
    This tool delegates to 'add_objects_to_board'. IDs will be auto-generated if not provided.
    """
    logger.info(f"Generic draw skill called with {len(objects)} objects. kwargs: {kwargs}")
    try:
        processed_objects = []
        for obj_spec in objects:
            if not obj_spec.get('id'):
                # Generate deterministic ID based on kind and a subset of properties
                # This is a simplistic approach; a more robust hash might involve more fields
                kind = obj_spec.get('kind', 'unknown')
                name_parts = [kind]
                if kind == 'text':
                    name_parts.append(obj_spec.get('text', ''))
                # Add other relevant properties for other kinds if necessary for determinism
                # For simplicity, we'll use a basic name string here. Consider a more robust approach for production.
                name_string = "-".join(str(p) for p in name_parts)
                obj_spec['id'] = str(uuid.uuid5(ASSISTANT_DRAWING_NAMESPACE, name_string))
            
            # Ensure metadata.source is set (add_objects_to_board also does this, but good to be explicit)
            meta = obj_spec.get("metadata", {})
            meta["source"] = "assistant"
            obj_spec["metadata"] = meta
            processed_objects.append(obj_spec)

        original_add_objects_func = getattr(add_objects_to_board, "__original_func__", add_objects_to_board)
        if not callable(original_add_objects_func):
            logger.error("add_objects_to_board.__original_func__ is not callable.")
            raise TypeError("Internal error: add_objects_to_board skill is not configured correctly.")

        # Build arguments for add_objects_to_board
        add_objects_args = {"specs": processed_objects}
        
        # Detect per-spec anchor info. If found in the first object with an anchor, these settings apply to the batch.
        # This is a simplification; ideally, each object could have its own anchor settings if add_objects_to_board supported it per-spec.
        for spec_item in processed_objects:
            if isinstance(spec_item, dict) and "anchor" in spec_item:
                anchor_info_from_spec = spec_item.pop("anchor") # Remove from spec
                if isinstance(anchor_info_from_spec, dict):
                    logger.info(f"Processing spec-level anchor for object {spec_item.get('id')}: {anchor_info_from_spec}")
                    add_objects_args["strategy"] = "anchor"

                    if "object_id" in anchor_info_from_spec:
                        add_objects_args["anchor_object_id"] = anchor_info_from_spec["object_id"]
                    elif "anchor_to" in anchor_info_from_spec: # Added alias
                        add_objects_args["anchor_object_id"] = anchor_info_from_spec["anchor_to"]
                        logger.info(f"Using 'anchor_to' as alias for anchor_object_id: {anchor_info_from_spec['anchor_to']}")

                    # --- X-axis ---
                    # Priority 1: Direct object_edge_x and anchor_edge_x
                    if "object_edge_x" in anchor_info_from_spec:
                        add_objects_args["object_edge_x"] = anchor_info_from_spec["object_edge_x"]
                    if "anchor_edge_x" in anchor_info_from_spec:
                        add_objects_args["anchor_edge_x"] = anchor_info_from_spec["anchor_edge_x"]

                    # Priority 2: align_x (sets both if direct ones not set)
                    if "align_x" in anchor_info_from_spec:
                        x_align_val = anchor_info_from_spec["align_x"]
                        if x_align_val in ["left", "center_x", "right"]:
                            if "object_edge_x" not in add_objects_args:
                                add_objects_args["object_edge_x"] = x_align_val
                            if "anchor_edge_x" not in add_objects_args:
                                add_objects_args["anchor_edge_x"] = x_align_val
                            logger.info(f"Using align_x ('{x_align_val}') for X-edges as specific keys not found or to confirm.")

                    # Priority 3: General object_edge / target_edge (legacy for X)
                    if "object_edge_x" not in add_objects_args and "object_edge" in anchor_info_from_spec:
                        add_objects_args["object_edge_x"] = anchor_info_from_spec["object_edge"]
                        logger.info(f"Fallback to general 'object_edge' for object_edge_x.")
                    if "anchor_edge_x" not in add_objects_args:
                        if "target_edge" in anchor_info_from_spec:
                            add_objects_args["anchor_edge_x"] = anchor_info_from_spec["target_edge"]
                            logger.info(f"Fallback to 'target_edge' for anchor_edge_x.")
                        elif "anchor_edge" in anchor_info_from_spec: # Alias for target_edge
                            add_objects_args["anchor_edge_x"] = anchor_info_from_spec["anchor_edge"]
                            logger.info(f"Fallback to 'anchor_edge' (alias for target_edge) for anchor_edge_x.")
                    
                    # --- Y-axis ---
                    # Priority 1: Direct object_edge_y and anchor_edge_y
                    if "object_edge_y" in anchor_info_from_spec:
                        add_objects_args["object_edge_y"] = anchor_info_from_spec["object_edge_y"]
                    if "anchor_edge_y" in anchor_info_from_spec:
                        add_objects_args["anchor_edge_y"] = anchor_info_from_spec["anchor_edge_y"]

                    # Priority 2: align_y (sets both if direct ones not set)
                    if "align_y" in anchor_info_from_spec:
                        y_align_val = anchor_info_from_spec["align_y"]
                        if y_align_val in ["top", "center_y", "bottom"]:
                            if "object_edge_y" not in add_objects_args:
                                add_objects_args["object_edge_y"] = y_align_val
                            if "anchor_edge_y" not in add_objects_args:
                                add_objects_args["anchor_edge_y"] = y_align_val
                            logger.info(f"Using align_y ('{y_align_val}') for Y-edges as specific keys not found or to confirm.")
                    
                    # Priority 3: General 'align' (can set X or Y if specific/align_x/align_y not found)
                    if "align" in anchor_info_from_spec:
                        align_val = anchor_info_from_spec["align"]
                        if align_val in ["top", "center_y", "bottom"]: # Y-value
                            if "object_edge_y" not in add_objects_args:
                                add_objects_args["object_edge_y"] = align_val
                                logger.info(f"Fallback to 'align: {align_val}' for object_edge_y.")
                            if "anchor_edge_y" not in add_objects_args:
                                add_objects_args["anchor_edge_y"] = align_val
                                logger.info(f"Fallback to 'align: {align_val}' for anchor_edge_y.")
                        elif align_val in ["left", "center_x", "right"]: # X-value
                            if "object_edge_x" not in add_objects_args:
                                add_objects_args["object_edge_x"] = align_val
                                logger.info(f"Fallback to 'align: {align_val}' for object_edge_x.")
                            if "anchor_edge_x" not in add_objects_args:
                                add_objects_args["anchor_edge_x"] = align_val
                                logger.info(f"Fallback to 'align: {align_val}' for anchor_edge_x.")
                    
                    # Offsets (direct pass-through)
                    if "offset_x_pct" in anchor_info_from_spec:
                        add_objects_args["offset_x_pct"] = anchor_info_from_spec["offset_x_pct"]
                    if "offset_y_pct" in anchor_info_from_spec:
                        add_objects_args["offset_y_pct"] = anchor_info_from_spec["offset_y_pct"]
                    
                    # Found and processed anchor from a spec, break to apply these settings to the batch.
                    break 
        
        # Pass through relevant optional arguments for add_objects_to_board if provided in kwargs
        # These are from the top-level 'draw' skill call args.
        # They will only be applied if not already set by the per-spec anchor logic above,
        # except for strategy and anchor_object_id which can be overridden by top-level.
        passthrough_priority_args = {"strategy", "anchor_object_id"} # these can be overridden by kwargs
        
        for arg_name in [
            "strategy", "anchor_object_id", "group_id",
            "anchor_edge", "object_edge", # Legacy general edges
            "anchor_edge_x", "object_edge_x", "anchor_edge_y", "object_edge_y", # New specific edges
            "offset_x_pct", "offset_y_pct",
            "template", "zone",
        ]:
            if arg_name in kwargs:
                # If arg already set by spec-level anchor, only override if it's a priority arg
                if arg_name in add_objects_args and arg_name not in passthrough_priority_args:
                    continue 
                add_objects_args[arg_name] = kwargs[arg_name]

        # Legacy / alternate anchor syntax: objects_anchor & objects_anchor_spec
        # This logic should ideally be phased out or also map to new _x/_y edges.
        # For now, it will map to the general 'anchor_edge' and 'object_edge' if specific _x/_y are not set.
        if "anchor_object_id" not in add_objects_args: # Only process if no anchor set by spec or top-level kwargs
            legacy_anchor_info_to_process: Optional[Dict[str, Any]] = None
            processed_legacy_key = None

            if "objects_anchor" in kwargs:
                try:
                    anchor_list = kwargs.get("objects_anchor")
                    if isinstance(anchor_list, list) and anchor_list:
                        legacy_anchor_info_to_process = anchor_list[0]
                        processed_legacy_key = "objects_anchor"
                except Exception:
                    logger.warning("Failed to parse objects_anchor argument for draw skill.")

            if not legacy_anchor_info_to_process and "objects_anchor_spec" in kwargs: # Check again
                try:
                    anchor_list = kwargs.get("objects_anchor_spec")
                    if isinstance(anchor_list, list) and anchor_list:
                        legacy_anchor_info_to_process = anchor_list[0]
                        processed_legacy_key = "objects_anchor_spec"
                except Exception:
                    logger.warning("Failed to parse objects_anchor_spec argument for draw skill.")

            if legacy_anchor_info_to_process:
                anchor_info = legacy_anchor_info_to_process
                logger.info(f"Processing legacy anchor syntax from '{processed_legacy_key}': {anchor_info}")
                add_objects_args["strategy"] = "anchor" 

                if "object_id" in anchor_info:
                    add_objects_args["anchor_object_id"] = anchor_info["object_id"]

                # X-axis alignment
                if "object_edge" in anchor_info: # New object's X edge
                    add_objects_args["object_edge_x"] = anchor_info["object_edge"]
                
                # Anchor object's X edge (target_edge is preferred, then anchor_edge, then target_object_edge)
                if "target_edge" in anchor_info:
                    add_objects_args["anchor_edge_x"] = anchor_info["target_edge"]
                elif "anchor_edge" in anchor_info: # Alias for target_edge
                    add_objects_args["anchor_edge_x"] = anchor_info["anchor_edge"]
                elif "target_object_edge" in anchor_info: # Legacy alias for anchor_edge/target_edge
                    add_objects_args["anchor_edge_x"] = anchor_info["target_object_edge"]

                # Y-axis alignment from align_y
                if "align_y" in anchor_info:
                    y_align_val = anchor_info["align_y"]
                    if y_align_val in ["top", "center_y", "bottom"]:
                        add_objects_args["object_edge_y"] = y_align_val
                        add_objects_args["anchor_edge_y"] = y_align_val
                # ADDED: Recognize "align" as an alias for "align_y" in legacy parsing too
                elif "align" in anchor_info:
                    y_align_val = anchor_info["align"]
                    logger.info(f"Legacy anchor ({processed_legacy_key}) interpreting 'align: {y_align_val}' as Y-axis alignment.")
                    if y_align_val in ["top", "center_y", "bottom"]:
                        add_objects_args["object_edge_y"] = y_align_val
                        add_objects_args["anchor_edge_y"] = y_align_val
                    elif y_align_val in ["left", "center_x", "right"]:
                        logger.info(f"Legacy anchor ({processed_legacy_key}) interpreting 'align: {y_align_val}' as X-axis alignment (align_x).")
                        add_objects_args["object_edge_x"] = y_align_val
                        add_objects_args["anchor_edge_x"] = y_align_val
                
                # X-axis alignment from align_x (takes precedence if provided for X)
                if "align_x" in anchor_info:
                    x_align_val = anchor_info["align_x"]
                    if x_align_val in ["left", "center_x", "right"]:
                        add_objects_args["object_edge_x"] = x_align_val
                        add_objects_args["anchor_edge_x"] = x_align_val
                        logger.info(f"Legacy anchor ({processed_legacy_key}) overriding X-edges with align_x: {x_align_val}")

                # Offsets
                if "offset_x_pct" in anchor_info:
                    add_objects_args["offset_x_pct"] = anchor_info["offset_x_pct"]
                if "offset_y_pct" in anchor_info:
                    add_objects_args["offset_y_pct"] = anchor_info["offset_y_pct"]
        
        logger.debug(f"Final add_objects_args for invoking add_objects_to_board: {add_objects_args}")
        tool_result = await invoke(original_add_objects_func, ctx=ctx, **add_objects_args)

        return tool_result

    except ToolInputError as tie:
        logger.error(f"Input error in draw skill (delegating to add_objects_to_board): {tie}")
        raise
    except Exception as e:
        logger.error(f"Error in generic draw skill: {e}", exc_info=True)
        raise


@skill
async def draw_text(ctx: Any, **kwargs) -> Dict[str, Any]:
    """Return a *single* CanvasObjectSpec describing a text label."""
    try:
        args = DrawTextArgs(**kwargs)
    except ValidationError as e:
        raise ToolInputError(f"Invalid arguments for draw_text: {e}")

    object_id = args.id
    if not object_id:
        name_string = f"text-{args.text}-{args.color_token}"
        object_id = str(uuid.uuid5(ASSISTANT_DRAWING_NAMESPACE, name_string))

    x_coord, y_coord = args.x, args.y
    width_val = args.width
    # Estimate width if not provided, fontSize could be a proxy for height for layout
    # This is a rough estimation, layout engine should ideally determine final dimensions
    # For bbox, we need some width.
    if x_coord is None or y_coord is None:
        # If no coordinates, layout engine will place it.
        # For now, _get_layout_position is a stub.
        # We need to ensure width/height used for bbox are sensible.
        # If width is not given, we can't really form a meaningful bbox here
        # without more complex text measurement. Let's assume layout gives it or it's an error.
        # For simplicity in this step, if x/y are None, we rely on _get_layout_position
        # and use provided width or a default if not available for bbox.
        x_coord, y_coord = _get_layout_position(args.width, args.fontSize)
    
    # Ensure width and height for bbox are reasonable.
    # fontSize might give an idea of height. Width is trickier for text.
    # For now, let's use provided width, or a default if not provided and x,y were given.
    # If x,y are from _get_layout_position, that function should ideally return dimensions.
    # However, _get_layout_position current stub doesn't.
    # This highlights a dependency on a more robust layout or measurement.
    # For Phase A step 4, we will ensure bbox is present.
    # We'll use a placeholder for width/height if not provided for bbox calculation.
    # A more robust solution would involve text measurement or layout service providing dimensions.
    
    final_width = args.width if args.width is not None else 100 # Placeholder width
    final_height = args.fontSize if args.fontSize is not None else 20 # Placeholder height based on fontSize

    fill_colour = await style_token.__original_func__(token=args.color_token)
    
    final_metadata = {
        "source": "assistant",
        "bbox": (float(x_coord), float(y_coord), float(final_width), float(final_height))
    }
    if args.custom_metadata:
        final_metadata.update(args.custom_metadata.model_dump(exclude_unset=True))
        # Ensure bbox from custom_metadata doesn't get overwritten if it was intended to be the source of truth
        # However, the plan implies the skill itself should construct it.
        # If custom_metadata contains 'bbox', it will be overwritten by the one constructed here.

    return {
        "id": object_id,
        "kind": "text",
        "x": x_coord,
        "y": y_coord,
        "text": args.text,
        **({"fontSize": args.fontSize} if args.fontSize else {}),
        **({"width": args.width} if args.width else {}), # This is the visual width property
        "fill": fill_colour,
        "metadata": final_metadata,
    }


@skill
async def draw_shape(ctx: Any, **kwargs) -> List[Dict[str, Any]]:
    """Draw a primitive shape (rect, circle, arrow). May return multiple specs."""
    try:
        args = DrawShapeArgs(**kwargs)
    except ValidationError as e:
        raise ToolInputError(f"Invalid arguments for draw_shape: {e}")

    object_id = args.id
    if not object_id:
        name_parts = [args.kind]
        if args.kind == "arrow" and args.points:
            points_str = ",".join(f"{p.x},{p.y}" for p in args.points)
            name_parts.append(points_str)
        name_string = f"shape-{'-'.join(name_parts)}-{args.color_token}"
        object_id = str(uuid.uuid5(ASSISTANT_DRAWING_NAMESPACE, name_string))

    x_coord, y_coord = args.x, args.y
    # Determine width and height for bbox
    shape_width = args.w
    shape_height = args.h
    if args.kind == "circle":
        shape_width = args.radius * 2 if args.radius else 60 # Default diameter
        shape_height = args.radius * 2 if args.radius else 60
    elif args.kind == "arrow":
        if args.points and len(args.points) >= 2:
            min_x = min(p.x for p in args.points)
            max_x = max(p.x for p in args.points)
            min_y = min(p.y for p in args.points)
            max_y = max(p.y for p in args.points)
            shape_width = max_x - min_x
            shape_height = max_y - min_y
            x_coord = min_x # Arrow's x,y should be top-left of its bounding box
            y_coord = min_y
        else: # Fallback for arrow without points or not enough points
            shape_width = args.w if args.w is not None else 60
            shape_height = args.h if args.h is not None else 2 # A line arrow might have small height
    else: # rect
        shape_width = args.w if args.w is not None else 100
        shape_height = args.h if args.h is not None else 60


    if x_coord is None or y_coord is None: # If not provided, use layout
        x_coord, y_coord = _get_layout_position(shape_width, shape_height)
    
    # Ensure all values are float for the tuple
    current_bbox = (
        float(x_coord), 
        float(y_coord), 
        float(shape_width if shape_width is not None else 0), # Ensure not None for bbox
        float(shape_height if shape_height is not None else 0) # Ensure not None for bbox
    )

    stroke_colour = await style_token.__original_func__(token=args.color_token)

    actions: List[Dict[str, Any]] = []
    
    base_metadata = {
        "source": "assistant",
        "bbox": current_bbox
    }
    if args.custom_metadata:
        base_metadata.update(args.custom_metadata.model_dump(exclude_unset=True))
        if "bbox" in base_metadata and base_metadata["bbox"] != current_bbox:
            # This handles if custom_metadata provided its own bbox, it would have been merged.
            # We ensure the calculated bbox is the one used unless custom_metadata is the definite source.
            # For now, skill-calculated bbox takes precedence if custom_metadata also had one.
             base_metadata["bbox"] = current_bbox


    if args.kind == "rect":
        actions.append(
            {
                "id": object_id,
                "kind": "rect",
                "x": x_coord,
                "y": y_coord,
                "width": shape_width, # Use calculated shape_width
                "height": shape_height, # Use calculated shape_height
                "stroke": stroke_colour,
                "strokeWidth": 2,
                "fill": "#FFFFFF", # Default fill for rect
                "metadata": base_metadata,
            }
        )
    elif args.kind == "circle":
        actions.append(
            {
                "id": object_id,
                "kind": "circle",
                "x": x_coord + (shape_width / 2 if shape_width else 0) , # FabricJS circle x,y is center
                "y": y_coord + (shape_height / 2 if shape_height else 0), # FabricJS circle x,y is center
                "radius": (shape_width / 2) if shape_width else (args.radius or 30),
                "stroke": stroke_colour,
                "strokeWidth": 2,
                "fill": "#FFFFFF", # Default fill for circle
                "metadata": base_metadata, # base_metadata already has bbox for the circle's bounding square
            }
        )
    elif args.kind == "arrow":
        flat_points: List[int] = []
        if args.points:
            for pt_spec in args.points:
                flat_points.extend([pt_spec.x, pt_spec.y])
        else: # Default arrow if no points
            flat_points = [x_coord, y_coord, x_coord + (shape_width if shape_width is not None else 60), y_coord]
        
        arrow_metadata = {**base_metadata, "role": "arrow"} # bbox is already in base_metadata
        actions.append(
            {
                "id": object_id,
                "kind": "line", # Arrows are often represented as lines with arrowheads
                "points": flat_points,
                "stroke": stroke_colour,
                "strokeWidth": 2,
                # Arrowheads can be properties of line in some libraries, or separate objects
                # Assuming simple line for now, visual arrowheads might be part of 'kind' interpretation by FE
                "metadata": arrow_metadata,
            }
        )
    else:
        raise ValueError(f"Unsupported shape kind: {args.kind}")

    if args.label:
        label_id_name = f"{object_id}-label-{args.label}"
        label_id = str(uuid.uuid5(ASSISTANT_DRAWING_NAMESPACE, label_id_name))
        
        # Position label relative to the main shape
        # This positioning is basic, a layout engine would be better.
        label_x_val = x_coord + (shape_width / 2 if shape_width is not None else 0)
        label_y_val = y_coord + (shape_height if shape_height is not None else 0) + 20 # Below the shape
        
        # Estimate label bbox (width could be based on text length, height on a default font size)
        label_width_est = len(args.label) * 8  # Rough estimate: 8px per char
        label_height_est = 20 # Rough estimate
        label_bbox = (float(label_x_val), float(label_y_val), float(label_width_est), float(label_height_est))

        label_metadata = {
            "source": "assistant", 
            "linked_to": object_id, 
            "role": "label",
            "bbox": label_bbox
        }
        if args.custom_metadata and args.custom_metadata.concept_key:
            label_metadata["concept_key"] = args.custom_metadata.concept_key
        if args.custom_metadata and args.custom_metadata.is_interactive is not None:
            label_metadata['is_interactive'] = args.custom_metadata.is_interactive

        actions.append(
            {
                "id": label_id,
                "kind": "text",
                "x": label_x_val,
                "y": label_y_val,
                "text": args.label,
                "fill": stroke_colour, # Label color same as shape stroke
                "metadata": label_metadata,
            }
        )

    return actions


# --------------------------------------------------------------------------- #
# *Alias* for clearing the board so older/other code can still import the
# existing skill name ``clear_whiteboard`` while newer code uses ``clear_board``.
# --------------------------------------------------------------------------- #

from ai_tutor.skills.clear_whiteboard import clear_whiteboard as _clear_whiteboard_existing


@skill(name_override="clear_board")
async def clear_board() -> Tuple[MessageResponse, List[Dict[str, Any]]]:  # noqa: D401 – simple verb
    """Return a CLEAR_BOARD whiteboard action to erase all content."""
    action = {"type": "CLEAR_BOARD"}  # Type matches frontend enum
    payload = MessageResponse(message_text="Whiteboard cleared.", message_type="status_update")
    return payload, [action] 