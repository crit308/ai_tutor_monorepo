from __future__ import annotations

"""ai_tutor/services/layout_allocator.py

Grid-based layout allocator for the collaborative whiteboard (Phase-2).

The allocator divides the infinite canvas into a fixed logical grid (default
8×6).  Each cell has a pixel size (default 220×140) that roughly matches the
average footprint of a small text box or icon drawn by the tutor.  When the
AI wants to add an object it calls
:pyfunc:`reserve_region` which returns the *top-left* coordinate of the first
contiguous block of free cells big enough to fit the requested width/height.

The implementation purposefully keeps NO external dependencies – all state is
kept in-memory and thus resets when the backend process restarts.  Persistence
across deployments can be added later by serialising ``_allocators`` to Redis
or Supabase.

NOTE: Only the **flow** strategy is implemented for now.  The *anchor* strategy
(described in improvements.md) can be added in a follow-up PR.
"""

from typing import Dict, List, Optional, Tuple, Literal
import asyncio
import math
import uuid
import logging

log = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
#  Configuration constants – tweak as needed
# --------------------------------------------------------------------------- #

_GRID_COLS = 4
_GRID_ROWS = 12
_CELL_WIDTH = 220   # px
_CELL_HEIGHT = 140  # px

# Define literal types for anchor placement
AnchorPlacement = Literal["right-of", "below"] # Add more as needed e.g. "top-left-of-anchor"

# --------------------------------------------------------------------------- #
#  Grid allocator implementation
# --------------------------------------------------------------------------- #

class _GridAllocator:
    """Per-session allocator instance keeping track of occupied cells."""

    def __init__(self, cols: int = _GRID_COLS, rows: int = _GRID_ROWS,
                 cell_w: int = _CELL_WIDTH, cell_h: int = _CELL_HEIGHT):
        self.cols = cols
        self.rows = rows
        self.cell_w = cell_w
        self.cell_h = cell_h
        # Grid[row][col] -> region_id | None
        self._grid: List[List[Optional[str]]] = [[None for _ in range(cols)] for _ in range(rows)]
        # region_id -> list[(row, col)]
        self._regions: Dict[str, List[Tuple[int, int]]] = {}
        self._lock = asyncio.Lock()

    # --------------------------------------------------------------------- #
    #  Public helpers
    # --------------------------------------------------------------------- #

    async def reserve(self, width: int, height: int,
                      anchor_bbox_grid: Optional[Tuple[int, int, int, int]] = None, # col_start, row_start, cols_span, rows_span of anchor
                      anchor_placement: Optional[AnchorPlacement] = None
                     ) -> Tuple[int, int, int, int, str] | None:
        """Find the first block of free cells that can fit *width* × *height*.

        Supports basic anchoring strategies ("right-of", "below").
        Returns ``(x, y, alloc_w, alloc_h, region_id)`` on success or ``None``
        if the board is full or anchor placement fails.
        """
        cols_needed = max(1, math.ceil(width / self.cell_w))
        rows_needed = max(1, math.ceil(height / self.cell_h))

        if cols_needed > self.cols or rows_needed > self.rows:
            return None # Requested block is larger than whole board

        if anchor_bbox_grid and anchor_placement:
            anchor_col_start, anchor_row_start, anchor_cols_span, anchor_rows_span = anchor_bbox_grid
            
            target_searches: List[Tuple[int, int, Literal["row-major", "col-major"]]] = []

            if anchor_placement == "right-of":
                # Try to place directly to the right, scanning rows first in that column block
                start_search_col = anchor_col_start + anchor_cols_span
                start_search_row = anchor_row_start 
                if start_search_col + cols_needed <= self.cols and start_search_row + rows_needed <= self.rows:
                    target_searches.append((start_search_col, start_search_row, "row-major"))
            
            elif anchor_placement == "below":
                # Try to place directly below, scanning columns first in that row block
                start_search_col = anchor_col_start
                start_search_row = anchor_row_start + anchor_rows_span
                if start_search_row + rows_needed <= self.rows and start_search_col + cols_needed <= self.cols:
                    target_searches.append((start_search_col, start_search_row, "col-major"))

            for start_col, start_row, scan_order in target_searches:
                # This is a simplified search, only checking the primary target spot
                # A more robust implementation would search a wider area around the anchor point based on strategy
                if scan_order == "row-major": # Search limited rows for the target col
                    for r_offset in range(anchor_rows_span): # Iterate within anchor's height span first
                        current_row = start_row + r_offset
                        if current_row + rows_needed > self.rows: break
                        if self._block_free(start_col, current_row, cols_needed, rows_needed):
                            return self._allocate_and_return(region_id=str(uuid.uuid4()), 
                                                             col=start_col, row=current_row, 
                                                             cols_needed=cols_needed, rows_needed=rows_needed)
                elif scan_order == "col-major": # Search limited cols for the target row
                    for c_offset in range(anchor_cols_span): # Iterate within anchor's width span first
                        current_col = start_col + c_offset
                        if current_col + cols_needed > self.cols: break
                        if self._block_free(current_col, start_row, cols_needed, rows_needed):
                            return self._allocate_and_return(region_id=str(uuid.uuid4()),
                                                             col=current_col, row=start_row,
                                                             cols_needed=cols_needed, rows_needed=rows_needed)
            # If anchored placement failed, could fall back to flow or return None
            # For now, if specific anchor fails, we return None (strict anchoring)
            return None 

        # Default: Simple row-major scan (flow strategy)
        for r in range(self.rows - rows_needed + 1):
            for c in range(self.cols - cols_needed + 1):
                if self._block_free(c, r, cols_needed, rows_needed):
                    return self._allocate_and_return(region_id=str(uuid.uuid4()), 
                                                     col=c, row=r, 
                                                     cols_needed=cols_needed, rows_needed=rows_needed)
        return None # No space found with flow strategy

    def _allocate_and_return(self, region_id: str, col: int, row: int, cols_needed: int, rows_needed: int):
        self._occupy_block(region_id, col, row, cols_needed, rows_needed)
        x_px = col * self.cell_w
        y_px = row * self.cell_h
        alloc_w = cols_needed * self.cell_w
        alloc_h = rows_needed * self.cell_h
        return (x_px, y_px, alloc_w, alloc_h, region_id)

    async def release(self, region_id: str) -> None:
        """Free all cells belonging to *region_id*."""
        cells = self._regions.pop(region_id, [])
        for r, c in cells:
            self._grid[r][c] = None

    # ------------------------------------------------------------------ #
    #  Internal helpers
    # ------------------------------------------------------------------ #

    def _block_free(self, start_col: int, start_row: int, cols_needed: int, rows_needed: int) -> bool:
        for r in range(start_row, start_row + rows_needed):
            for c in range(start_col, start_col + cols_needed):
                if self._grid[r][c] is not None:
                    return False
        return True

    def _occupy_block(self, region_id: str, start_col: int, start_row: int, cols_needed: int, rows_needed: int) -> None:
        cells: List[Tuple[int, int]] = []
        for r in range(start_row, start_row + rows_needed):
            for c in range(start_col, start_col + cols_needed):
                self._grid[r][c] = region_id
                cells.append((r, c))
        self._regions[region_id] = cells


# --------------------------------------------------------------------------- #
#  Module-level registry – session_id -> allocator
# --------------------------------------------------------------------------- #

_allocators: Dict[str, _GridAllocator] = {}


async def _get_allocator(session_id: str) -> _GridAllocator:
    """Return the allocator for *session_id*, creating one if needed."""
    if session_id not in _allocators:
        # Pass current module-level (potentially monkeypatched) constants to constructor
        _allocators[session_id] = _GridAllocator(
            cols=_GRID_COLS, 
            rows=_GRID_ROWS, 
            cell_w=_CELL_WIDTH, 
            cell_h=_CELL_HEIGHT
        )
        log.debug("[LayoutAllocator] Created new allocator for session %s", session_id)
    return _allocators[session_id]


# --------------------------------------------------------------------------- #
#  Public coroutine API – used by skills
# --------------------------------------------------------------------------- #

async def reserve_region(
    session_id: str,
    requested_width: int,
    requested_height: int,
    strategy: str = "flow",
    anchor_object_id: str | None = None, # Retained for context, not directly used by allocator for now if bbox is primary
    anchor_object_bbox: Optional[Dict[str, float]] = None, # e.g. {"x": float, "y": float, "width": float, "height": float}
    anchor_placement: Optional[AnchorPlacement] = None, # "right-of", "below"
    group_id: str | None = None,
):
    """Reserve space on the canvas and return placement information.

    Supports "flow" and basic "anchor" (right-of, below) strategies.
    For "anchor" strategy, anchor_object_bbox and anchor_placement must be provided.
    """
    if strategy == "anchor":
        if not anchor_object_bbox or not anchor_placement:
            raise ValueError("For 'anchor' strategy, 'anchor_object_bbox' and 'anchor_placement' must be provided.")
    elif strategy != "flow": # Explicitly check for flow if not anchor
        raise NotImplementedError(f"Unsupported layout strategy: {strategy}. Only 'flow' and 'anchor' are supported.")

    allocator = await _get_allocator(session_id)
    anchor_bbox_grid: Optional[Tuple[int, int, int, int]] = None

    if strategy == "anchor" and anchor_object_bbox:
        # Convert pixel bbox of anchor to grid cell bbox
        ax = anchor_object_bbox['x']
        ay = anchor_object_bbox['y']
        aw = anchor_object_bbox['width']
        ah = anchor_object_bbox['height']
        
        anchor_col_start = math.floor(ax / allocator.cell_w)
        anchor_row_start = math.floor(ay / allocator.cell_h)
        anchor_cols_span = math.ceil(aw / allocator.cell_w)
        anchor_rows_span = math.ceil(ah / allocator.cell_h)
        anchor_bbox_grid = (anchor_col_start, anchor_row_start, anchor_cols_span, anchor_rows_span)

    async with allocator._lock:
        result = await allocator.reserve(requested_width, requested_height, 
                                         anchor_bbox_grid=anchor_bbox_grid, 
                                         anchor_placement=anchor_placement if strategy == "anchor" else None)
        if result is None:
            return None
        x, y, w, h, region_id = result
        return {
            "x": x,
            "y": y,
            "width": w,
            "height": h,
            "regionId": region_id,
            # Echo extra contextual keys so the caller can propagate them
            **({"groupId": group_id} if group_id else {}),
        }


async def release_region(session_id: str, region_id: str):
    """Release a previously-reserved region back to the allocator."""
    allocator = await _get_allocator(session_id)
    async with allocator._lock:
        await allocator.release(region_id) 