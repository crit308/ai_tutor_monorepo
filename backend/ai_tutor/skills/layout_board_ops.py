from __future__ import annotations

"""ai_tutor/skills/layout_board_ops.py

Core Phase-2 whiteboard manipulation skills that leverage the layout allocator
implemented in :pymod:`ai_tutor.services.layout_allocator`.
"""

from typing import Any, Dict, List, Optional
import logging
from enum import Enum

from pydantic import BaseModel, Field, ValidationError

from ai_tutor.skills import skill
from ai_tutor.exceptions import ToolInputError
from ai_tutor.api_models import MessageResponse
from ai_tutor.services import layout_allocator as _alloc
from ai_tutor.services import layout_templates as _template_resolver
from services.whiteboard_metadata import Metadata  # Changed import
from ai_tutor.dependencies import get_redis_client
from ai_tutor.services import spatial_index as _spatial_idx
from y_py import YDoc, apply_update  # type: ignore
from redis.asyncio import Redis  # type: ignore

log = logging.getLogger(__name__)

# Assume CanvasObjectSpec is defined elsewhere and imported, e.g.:
# from ai_tutor.api_models import CanvasObjectSpec
# For now, using a string forward reference.
CanvasObjectSpec = "CanvasObjectSpec"

# Re-export for easy access
__all__ = ["Metadata", "add_objects_to_board", "update_object_on_board", "delete_object_on_board", "find_object_on_board", "highlight_object_on_board"]

# --------------------------------------------------------------------------- #
#  Anchor Enum Definitions
# --------------------------------------------------------------------------- #
class AnchorEdge(str, Enum):
    TOP = "top"
    BOTTOM = "bottom"
    LEFT = "left"
    RIGHT = "right"
    CENTER_X = "center_x"
    CENTER_Y = "center_y"

class ObjectEdge(str, Enum):
    TOP = "top"
    BOTTOM = "bottom"
    LEFT = "left"
    RIGHT = "right"
    CENTER_X = "center_x"
    CENTER_Y = "center_y"


# --------------------------------------------------------------------------- #
#  Common Pydantic models
# --------------------------------------------------------------------------- #

class PartialCanvasObjectSpec(BaseModel):
    """Subset of CanvasObjectSpec accepted by the add_objects_to_board skill."""

    id: str = Field(..., min_length=1)
    kind: str = Field(..., min_length=1)

    # Optional bounding box parameters – at least *one* size hint must be given
    width: Optional[int] = Field(None, gt=0)
    height: Optional[int] = Field(None, gt=0)

    # Allow Pct versions too, which will be handled by the skill
    widthPct: Optional[float] = Field(None, ge=0, le=1)
    heightPct: Optional[float] = Field(None, ge=0, le=1)

    # Free-form extra properties (colour, text, radius …)
    metadata: Optional[Dict[str, Any]] = None
    # Store any other arbitrary keys (e.g. fontSize, fill) without validation
    class Config:  # noqa: D411
        extra = "allow"


class AddObjectsArgs(BaseModel):
    specs: List[Dict[str, Any]]
    
    # "explicit": objects define their own xPct/yPct or abs x/y. This is the new default.
    # "anchor": objects are placed relative to 'anchor_object_id'.
    # "zone": objects are placed within 'zone' of 'template'. 'template' & 'zone' must be top-level args.
    # "flow": use layout_allocator to find space (old default, now used if no other info).
    strategy: str = Field(default="explicit", pattern="^(flow|anchor|explicit|zone)$")
    
    # Anchor strategy args (used if strategy is "anchor")
    anchor_object_id: Optional[str] = Field(None, description="ID of the object to anchor to.")
    anchor_edge: Optional[AnchorEdge] = Field(AnchorEdge.RIGHT, description="Which edge of the anchor object to align to.")
    object_edge: Optional[ObjectEdge] = Field(ObjectEdge.LEFT, description="Which edge of the new object to align with the anchor_edge.")
    offset_x_pct: Optional[float] = Field(0.0, description="Offset in percentage of canvas width from the anchor point.")
    offset_y_pct: Optional[float] = Field(0.0, description="Offset in percentage of canvas height from the anchor point.")
    
    # New specific edge parameters for X and Y alignment
    anchor_edge_x: Optional[AnchorEdge] = Field(None, description="Which X-edge of the anchor object to align to (e.g., left, right, center_x).")
    object_edge_x: Optional[ObjectEdge] = Field(None, description="Which X-edge of the new object to align with anchor_edge_x (e.g., left, right, center_x).")
    anchor_edge_y: Optional[AnchorEdge] = Field(None, description="Which Y-edge of the anchor object to align to (e.g., top, bottom, center_y).")
    object_edge_y: Optional[ObjectEdge] = Field(None, description="Which Y-edge of the new object to align with anchor_edge_y (e.g., top, bottom, center_y).")
    
    # Zone strategy args (used if strategy is "zone" or if specified alongside other strategies)
    template: Optional[str] = Field(None, description="Optional layout template name to use for resolving zone coordinates.")
    zone: Optional[str] = Field(None, description="Optional zone name within the template to place the object(s).")
    
    group_id: Optional[str] = None


class UpdateObjectArgs(BaseModel):
    object_id: str = Field(..., min_length=1)
    updates: Dict[str, Any]


class DeleteObjectArgs(BaseModel):
    object_id: str = Field(..., min_length=1)


class FindObjectArgs(BaseModel):
    meta_query: Optional[Dict[str, Any]] = None
    fields: Optional[List[str]] = None
    spatial_query: Optional[tuple[float, float, float, float]] = None


# --------------------------------------------------------------------------- #
#  Helper utilities
# --------------------------------------------------------------------------- #

_DEFAULT_WIDTH = 200
_DEFAULT_HEIGHT = 120


def _matches_meta(spec: Dict[str, Any], query: Dict[str, Any]) -> bool:
    """Return True iff *spec*'s metadata satisfies *query* (shallow match).

    Supports dotted keys like ``meta.role`` to traverse one level deep.
    """
    meta = spec.get("metadata") or {}
    for k, v in query.items():
        if "." in k:
            first, second = k.split(".", 1)
            target = spec.get(first) if first != "meta" else meta
            if isinstance(target, dict):
                if target.get(second) != v:
                    return False
            else:
                return False
        else:
            if meta.get(k) != v:
                return False
    return True

def _augment_metadata_source_group(spec: Dict[str, Any], group_id: Optional[str]):
    """Helper to add source and groupId to metadata."""
    meta = spec.get("metadata", {})
    meta["source"] = "assistant"
    if group_id:
        meta["groupId"] = group_id
    spec["metadata"] = meta

# --------------------------------------------------------------------------- #
#  Skill implementations
# --------------------------------------------------------------------------- #

_REDIS_KEY_PREFIX = "yjs:snapshot:"


async def _get_object_bbox_from_yjs(session_id: str, object_id: str) -> Optional[Dict[str, float]]:
    """Helper to fetch an object's metadata.bbox from Yjs snapshot."""
    redis_client: Redis = await get_redis_client()
    redis_key = f"{_REDIS_KEY_PREFIX}{session_id}"
    yjs_snapshot_bytes: Optional[bytes] = await redis_client.get(redis_key)

    if not yjs_snapshot_bytes:
        log.warning(f"_get_object_bbox_from_yjs: No Yjs snapshot for session {session_id}")
        return None

    ydoc = YDoc()
    try:
        apply_update(ydoc, yjs_snapshot_bytes)
        with ydoc.begin_transaction() as txn:
            canvas_map = ydoc.get_map("objects")
            raw_objects = canvas_map.to_json(txn) # type: ignore
            
            anchor_object_data = raw_objects.get(object_id)
            if not anchor_object_data or not isinstance(anchor_object_data, dict):
                log.warning(f"_get_object_bbox_from_yjs: Anchor object {object_id} not found in Yjs map for session {session_id}.")
                return None
            
            metadata = anchor_object_data.get("metadata")
            if not metadata or not isinstance(metadata, dict):
                log.warning(f"_get_object_bbox_from_yjs: Anchor object {object_id} has no metadata.")
                return None
            
            # Prefer pctCoords if available, then bbox, then absolute x,y,width,height
            # This function's primary goal is to provide an *absolute* bbox for the allocator if needed
            # The new anchor strategy for relative placement will happen on frontend.
            # This YJS fetch is mostly for the 'flow' allocator if it were to use its own anchor.

            if "pctCoords" in metadata and isinstance(metadata["pctCoords"], dict):
                 # Cannot resolve pctCoords to absolute bbox without canvas dimensions here.
                 # This path is problematic if the goal is an absolute bbox.
                 # For now, if only pctCoords, we cannot give an absolute bbox to the old allocator.
                 log.debug(f"Anchor object {object_id} has pctCoords. Absolute bbox cannot be determined server-side without canvas dims.")
                 # If we need to support allocator's anchor mode with Pct objects, this needs canvas dims.

            bbox_tuple = metadata.get("bbox") # Assume this is absolute, stored by frontend/allocator
            if bbox_tuple and isinstance(bbox_tuple, (list, tuple)) and len(bbox_tuple) == 4 and all(isinstance(n, (int, float)) for n in bbox_tuple):
                log.debug(f"Found absolute bbox for anchor {object_id} in metadata.bbox: {bbox_tuple}")
                return {"x": float(bbox_tuple[0]), "y": float(bbox_tuple[1]), "width": float(bbox_tuple[2]), "height": float(bbox_tuple[3])}

            # Fallback to direct absolute properties if bbox not present
            abs_x = metadata.get("x")
            abs_y = metadata.get("y")
            abs_w = metadata.get("width")
            abs_h = metadata.get("height")
            if all(isinstance(v, (int, float)) for v in [abs_x, abs_y, abs_w, abs_h]):
                log.debug(f"Found absolute x,y,width,height for anchor {object_id}: x={abs_x}, y={abs_y}, w={abs_w}, h={abs_h}")
                return {"x": float(abs_x), "y": float(abs_y), "width": float(abs_w), "height": float(abs_h)} # type: ignore

            log.warning(f"_get_object_bbox_from_yjs: Anchor object {object_id} metadata.bbox or abs coords missing/invalid.")
            return None

    except Exception as exc:
        log.error(f"_get_object_bbox_from_yjs: Failed to process Yjs for object {object_id} in session {session_id} – {exc}", exc_info=True)
        return None


@skill
async def add_objects_to_board(ctx: Any, **kwargs):  # noqa: D401 – simple verb
    """Process object specifications and prepare them for whiteboard rendering based on chosen strategy.

    This is the primary write-path for the AI in Phase-2.  Callers supply a list
    of *partial* CanvasObjectSpec dictionaries that omit absolute coordinates –
    the allocator fills in ``x``/``y`` and, if missing, ``width``/``height``.
    """
    try:
        args = AddObjectsArgs(**kwargs)
    except ValidationError as e:
        raise ToolInputError(f"Invalid arguments for add_objects_to_board: {e}")

    # This list will hold the final specs for individual objects after processing.
    # The 'whiteboard_action' will then be constructed based on these and the overall strategy args.
    processed_object_specs: List[Dict[str, Any]] = []

    for spec_in_raw in args.specs:
        spec_in = dict(spec_in_raw)
        # Assuming PartialCanvasObjectSpec performs some validation/defaulting
        # pyd_spec = PartialCanvasObjectSpec(**spec_in) 
        # For now, out_spec is largely a pass-through of what the LLM sent for the object itself
        out_spec: Dict[str, Any] = dict(spec_in) 

        # Augment common metadata (source, groupId)
        _augment_metadata_source_group(out_spec, args.group_id)
        
        # If the overall strategy is 'anchor', we need to ensure the frontend
        # receives the necessary anchor information associated with THIS object,
        # typically via its metadata or if the action itself carries it per object.
        # The current frontend (WhiteboardProvider) expects ADD_OBJECTS action to have
        # top-level strategy and anchor_object_id, and then it populates metadata.relativePlacement
        # for each object spec. So, individual out_spec doesn't need to change much here yet
        # regarding anchor params, UNLESS the backend were to pre-calculate positions for anchoring.
        # The main change is ensuring the ACTION sent to frontend contains strategy info.

        # For "zone" strategy, resolve the zone to pct coordinates
        if args.template and args.zone and (args.strategy == "zone" or spec_in.get("zone")): # Allow per-object zone
            current_zone = spec_in.get("zone", args.zone) # per-object overrides global
            current_template = spec_in.get("template", args.template)

            resolved_coords = _template_resolver.get_layout_template_zone_coords(
                template_name=current_template, zone_name=current_zone
            )
            if resolved_coords:
                log.debug(f"Zone '{current_zone}' in template '{current_template}' resolved to: {resolved_coords}")
                # Apply resolved zone coordinates, allowing explicit spec values to override
                out_spec["xPct"] = out_spec.get("xPct", resolved_coords.x_pct)
                out_spec["yPct"] = out_spec.get("yPct", resolved_coords.y_pct)
                out_spec["widthPct"] = out_spec.get("widthPct", resolved_coords.width_pct)
                out_spec["heightPct"] = out_spec.get("heightPct", resolved_coords.height_pct)
                
                # Remove absolute x,y if Pct are now set from zone, to avoid conflict on frontend
                if "xPct" in out_spec: out_spec.pop("x", None)
                if "yPct" in out_spec: out_spec.pop("y", None)

                current_spec_meta = out_spec.get("metadata", {})
                current_spec_meta["resolvedFromZone"] = f"{current_template}:{current_zone}"
                out_spec["metadata"] = current_spec_meta
            else:
                log.warning(f"Could not resolve zone '{current_zone}' in template '{current_template}'. Object {out_spec.get('id')} may not be placed as intended.")

        # TODO: Handle 'flow' strategy by calling layout_allocator if necessary
        # For now, 'flow', 'explicit', or unhandled 'zone' will pass through whatever coords are in out_spec

        processed_object_specs.append(out_spec)

    if not processed_object_specs:
        return MessageResponse(message_text="No objects were processed or specified.", message_type="status_update"), []

    # Construct the single ADD_OBJECTS action
    # This action will contain ALL objects processed in this call.
    whiteboard_action: Dict[str, Any] = {
        "type": "ADD_OBJECTS",
        "objects": processed_object_specs
    }

    # If a strategy is defined that applies to the whole action, add its parameters
    if args.strategy: # Check if strategy is not None or empty
        whiteboard_action["strategy"] = args.strategy
        if args.strategy == "anchor":
            if not args.anchor_object_id:
                raise ToolInputError("anchor_object_id is required when strategy is 'anchor'.")
            whiteboard_action["anchor_object_id"] = args.anchor_object_id
            
            # Pass through all specific anchor alignment and offset parameters
            if hasattr(args, 'anchor_edge_x') and args.anchor_edge_x is not None:
                whiteboard_action["anchor_edge_x"] = args.anchor_edge_x.value
            if hasattr(args, 'object_edge_x') and args.object_edge_x is not None:
                whiteboard_action["object_edge_x"] = args.object_edge_x.value
            if hasattr(args, 'anchor_edge_y') and args.anchor_edge_y is not None:
                whiteboard_action["anchor_edge_y"] = args.anchor_edge_y.value
            if hasattr(args, 'object_edge_y') and args.object_edge_y is not None:
                whiteboard_action["object_edge_y"] = args.object_edge_y.value
            
            if hasattr(args, 'offset_x_pct'): # These have defaults in Pydantic model, so always pass
                whiteboard_action["offset_x_pct"] = args.offset_x_pct
            if hasattr(args, 'offset_y_pct'):
                whiteboard_action["offset_y_pct"] = args.offset_y_pct

        elif args.strategy == "zone":
            if args.template:
                 whiteboard_action["template"] = args.template
            if args.zone:
                 whiteboard_action["zone"] = args.zone
    
    # If group_id is specified at the action level, it's usually for creating a new group
    # The frontend doesn't currently use a top-level group_id on ADD_OBJECTS for this purpose.
    # Grouping is a separate GROUP_OBJECTS action.
    # However, individual objects can have a groupId in their metadata.
    # This was handled by _augment_metadata_source_group already.

    log.debug(f"Constructed whiteboard_action for add_objects_to_board: {whiteboard_action}")

    payload = MessageResponse(
        message_text=f"Processed {len(processed_object_specs)} object(s) for the whiteboard.",
        message_type="status_update"
    )
    # The whiteboard_actions parameter of MessageResponse expects a list of actions.
    return payload, [whiteboard_action]


@skill
async def update_object_on_board(ctx: Any, **kwargs):  # noqa: D401 – simple verb
    try:
        args = UpdateObjectArgs(**kwargs)
    except ValidationError as e:
        raise ToolInputError(f"Invalid arguments for update_object_on_board: {e}")

    raw_updates = dict(args.updates) 
    final_updates_for_action: Dict[str, Any] = {}

    # Directly pass through Pct values, and nullify corresponding absolute values.
    # If absolute is given and Pct is not, pass absolute and nullify Pct.
    # This logic is for the 'updates' payload, frontend's calculateAbsoluteCoords handles resolution.

    # Position
    if "xPct" in raw_updates and raw_updates["xPct"] is not None:
        final_updates_for_action["xPct"] = raw_updates["xPct"]
        final_updates_for_action["x"] = None 
    elif "x" in raw_updates and raw_updates["x"] is not None:
        final_updates_for_action["x"] = raw_updates["x"]
        final_updates_for_action["xPct"] = None
    elif "x" in raw_updates and raw_updates["x"] is None: # Explicitly nulling x
        final_updates_for_action["x"] = None

    if "yPct" in raw_updates and raw_updates["yPct"] is not None:
        final_updates_for_action["yPct"] = raw_updates["yPct"]
        final_updates_for_action["y"] = None
    elif "y" in raw_updates and raw_updates["y"] is not None:
        final_updates_for_action["y"] = raw_updates["y"]
        final_updates_for_action["yPct"] = None
    elif "y" in raw_updates and raw_updates["y"] is None: # Explicitly nulling y
        final_updates_for_action["y"] = None
        
    # Dimensions
    if "widthPct" in raw_updates and raw_updates["widthPct"] is not None:
        final_updates_for_action["widthPct"] = raw_updates["widthPct"]
        final_updates_for_action["width"] = None
    elif "width" in raw_updates and raw_updates["width"] is not None:
        final_updates_for_action["width"] = raw_updates["width"]
        final_updates_for_action["widthPct"] = None
    elif "width" in raw_updates and raw_updates["width"] is None: # Explicitly nulling width
        final_updates_for_action["width"] = None

    if "heightPct" in raw_updates and raw_updates["heightPct"] is not None:
        final_updates_for_action["heightPct"] = raw_updates["heightPct"]
        final_updates_for_action["height"] = None
    elif "height" in raw_updates and raw_updates["height"] is not None:
        final_updates_for_action["height"] = raw_updates["height"]
        final_updates_for_action["heightPct"] = None
    elif "height" in raw_updates and raw_updates["height"] is None: # Explicitly nulling height
        final_updates_for_action["height"] = None

    # Copy other updates that are not coordinate/dimension related
    for key, value in raw_updates.items():
        if key not in ["x", "y", "xPct", "yPct", "width", "height", "widthPct", "heightPct"]:
            final_updates_for_action[key] = value
            
    log.debug(f"Updating object {args.object_id} with processed payload: {final_updates_for_action}")

    action = {
        "type": "UPDATE_OBJECTS",
        "objects": [
            {
                "objectId": args.object_id,
                "updates": final_updates_for_action,
            }
        ]
    }
    payload = MessageResponse(message_text="Updated an object on the whiteboard.", message_type="status_update")
    return payload, [action]


@skill
async def delete_object_on_board(ctx: Any, **kwargs):  # noqa: D401 – simple verb
    try:
        args = DeleteObjectArgs(**kwargs)
    except ValidationError as e:
        raise ToolInputError(f"Invalid arguments for delete_object_on_board: {e}")

    action = {
        "type": "DELETE_OBJECTS",
        "objectIds": [args.object_id],
    }
    payload = MessageResponse(message_text="Removed an object from the whiteboard.", message_type="status_update")
    return payload, [action]


@skill(name_override="highlight_object_on_board")
async def highlight_object_on_board(ctx: Any, **kwargs):  # noqa: D401 – simple verb
    # Ensure the wrapped skill is available or handle import error
    try:
        from ai_tutor.skills.advanced_whiteboard import highlight_object as _highlight
        return await _highlight.__original_func__(ctx=ctx, **kwargs) # type: ignore
    except ImportError:
        log.error("Failed to import 'highlight_object' from 'ai_tutor.skills.advanced_whiteboard'")
        raise ToolInputError("Highlight feature is currently unavailable.")


@skill
async def find_object_on_board(ctx: Any, **kwargs):  # noqa: D401 – simple verb
    """Find objects on the whiteboard by metadata and/or spatial query.

    Returns a list of CanvasObjectSpec matching the criteria within the MessageResponse.
    """
    try:
        args = FindObjectArgs(**kwargs)
    except ValidationError as e:
        raise ToolInputError(f"Invalid arguments for find_object_on_board: {e}")

    if not args.meta_query and not args.spatial_query:
        raise ToolInputError("At least one of meta_query or spatial_query must be provided for find_object_on_board.")

    redis_client: Redis = await get_redis_client()
    redis_key = f"{_REDIS_KEY_PREFIX}{ctx.session_id}"
    yjs_snapshot_bytes: Optional[bytes] = await redis_client.get(redis_key)

    if not yjs_snapshot_bytes:
        log.info(f"No Yjs snapshot found for session {ctx.session_id} to find objects.")
        return MessageResponse(message_text="Whiteboard is empty or snapshot not found.", data=[]), []

    ydoc = YDoc()
    objects_data: List[Dict[str, Any]] = []
    try:
        apply_update(ydoc, yjs_snapshot_bytes) 
        with ydoc.begin_transaction() as txn:
            canvas_map = ydoc.get_map("objects") 
            raw_objects = canvas_map.to_json(txn) # type: ignore
            
            for obj_id, obj_content in raw_objects.items():
                if isinstance(obj_content, dict):
                    obj_data_with_id = dict(obj_content)
                    obj_data_with_id['id'] = obj_id 
                    objects_data.append(obj_data_with_id)
                else:
                    log.warning(f"Skipping non-dict object content for ID {obj_id} from Yjs map.")

    except Exception as exc:
        log.error(f"find_object_on_board: Failed to decode Yjs snapshot or read map – {exc}", exc_info=True)
        return MessageResponse(message_text="Error processing whiteboard state.", data=[]), []

    if not objects_data:
        log.info(f"No objects found in Yjs snapshot for session {ctx.session_id}.")
        return MessageResponse(message_text="Whiteboard is empty.", data=[]), []
        
    rtree = _spatial_idx.RTreeIndex()
    valid_spatial_objects = 0
    for obj in objects_data:
        try:
            # Try to get absolute coords; this is tricky if only Pct are stored and no canvas dims here
            obj_x, obj_y, obj_w, obj_h = None, None, None, None
            if "bbox" in obj.get("metadata", {}) and len(obj["metadata"]["bbox"]) == 4:
                bbox = obj["metadata"]["bbox"]
                obj_x, obj_y, obj_w, obj_h = bbox[0], bbox[1], bbox[2], bbox[3]
            elif all(k in obj for k in ["x", "y", "width", "height"]):
                obj_x, obj_y, obj_w, obj_h = obj["x"], obj["y"], obj["width"], obj["height"]
            
            if all(isinstance(v, (int, float)) for v in [obj_x, obj_y, obj_w, obj_h]):
                rtree.add_object(obj['id'], float(obj_x), float(obj_y), float(obj_w), float(obj_h)) # type: ignore
                valid_spatial_objects +=1
            # else: log.debug(f"Object {obj.get('id')} lacks absolute bbox for spatial indexing by find_object_on_board.")
        except (TypeError, ValueError, KeyError) as e:
            log.debug(f"Skipping object {obj.get('id')} for spatial index due to missing/invalid coords: {e}")
            continue
    log.debug(f"Built R-tree with {valid_spatial_objects} objects for find_object_on_board.")


    spatial_id_set = None
    if args.spatial_query:
        if valid_spatial_objects > 0:
            qx, qy, qw, qh = args.spatial_query
            spatial_ids = rtree.query_intersecting_objects(qx, qy, qw, qh)
            spatial_id_set = set(spatial_ids)
            log.debug(f"Spatial query found IDs: {spatial_id_set}")
        else: # No objects in R-tree, so spatial query yields nothing
            spatial_id_set = set()


    matches: List[Dict[str, Any]] = []
    for spec_dict in objects_data:
        passes_meta_filter = True
        if args.meta_query:
            if not _matches_meta(spec_dict, args.meta_query):
                passes_meta_filter = False
        
        if not passes_meta_filter:
            continue

        # If spatial_query was performed, check if current object is in the results
        if spatial_id_set is not None and spec_dict.get('id') not in spatial_id_set:
            continue

        # If all filters passed
        if args.fields:
            projected_spec = {field: spec_dict.get(field) for field in args.fields if field in spec_dict}
            if 'id' in spec_dict and 'id' not in projected_spec: # Always include ID if original had it
                 projected_spec['id'] = spec_dict['id']
            matches.append(projected_spec)
        else:
            matches.append(spec_dict)
            
    log.info(f"find_object_on_board completed. Found {len(matches)} objects for session {ctx.session_id} matching query.")
    payload = MessageResponse(
        message_text=f"Found {len(matches)} objects matching criteria.",
        data=matches
    )
    return payload, [] 