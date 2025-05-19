import pytest
import math
from unittest.mock import patch, MagicMock

from ai_tutor.services import layout_allocator
from ai_tutor.services.layout_allocator import _GridAllocator, reserve_region, release_region, _get_allocator

# Define constants for grid for easier testing if needed
TEST_GRID_COLS = 8
TEST_GRID_ROWS = 6
TEST_CELL_WIDTH = 100 # Simplified from 220
TEST_CELL_HEIGHT = 50  # Simplified from 140

@pytest.fixture
async def test_allocator(monkeypatch):
    # Reset the global _allocators dict for each test to ensure isolation
    monkeypatch.setattr(layout_allocator, "_allocators", {})
    
    # Patch constants for predictable grid math
    monkeypatch.setattr(layout_allocator, "_GRID_COLS", TEST_GRID_COLS)
    monkeypatch.setattr(layout_allocator, "_GRID_ROWS", TEST_GRID_ROWS)
    monkeypatch.setattr(layout_allocator, "_CELL_WIDTH", TEST_CELL_WIDTH)
    monkeypatch.setattr(layout_allocator, "_CELL_HEIGHT", TEST_CELL_HEIGHT)
    
    session_id = "test_session_layout"
    alloc = await _get_allocator(session_id)
    return alloc, session_id

@pytest.mark.asyncio
async def test_reserve_region_flow_basic(test_allocator):
    alloc, session_id = await test_allocator
    # Request 1x1 cell object
    placement = await reserve_region(session_id, TEST_CELL_WIDTH, TEST_CELL_HEIGHT, strategy="flow")
    assert placement is not None
    assert placement["x"] == 0
    assert placement["y"] == 0
    assert placement["width"] == TEST_CELL_WIDTH
    assert placement["height"] == TEST_CELL_HEIGHT
    assert "regionId" in placement

@pytest.mark.asyncio
async def test_reserve_region_anchor_right_of(test_allocator):
    alloc, session_id = await test_allocator
    
    # 1. Place an anchor object (e.g., 2 cells wide, 1 cell high, at grid 0,0)
    anchor_width_px = 2 * TEST_CELL_WIDTH
    anchor_height_px = 1 * TEST_CELL_HEIGHT
    anchor_x_px = 0 * TEST_CELL_WIDTH
    anchor_y_px = 0 * TEST_CELL_HEIGHT

    # Manually reserve the anchor space for this test scenario
    # The reserve_region itself uses _allocator.reserve, so we prime the allocator state
    anchor_cols_needed = math.ceil(anchor_width_px / TEST_CELL_WIDTH)
    anchor_rows_needed = math.ceil(anchor_height_px / TEST_CELL_HEIGHT)
    anchor_region_id = "anchor_obj_1"
    alloc._occupy_block(anchor_region_id, 0, 0, anchor_cols_needed, anchor_rows_needed)
    
    anchor_bbox = {
        "x": float(anchor_x_px),
        "y": float(anchor_y_px),
        "width": float(anchor_width_px),
        "height": float(anchor_height_px)
    }

    # 2. Request a new object (1x1 cell) to be placed "right-of" the anchor
    new_obj_width_px = 1 * TEST_CELL_WIDTH
    new_obj_height_px = 1 * TEST_CELL_HEIGHT
    
    placement = await reserve_region(
        session_id=session_id,
        requested_width=new_obj_width_px,
        requested_height=new_obj_height_px,
        strategy="anchor",
        anchor_object_bbox=anchor_bbox,
        anchor_placement="right-of"
    )

    assert placement is not None, "Placement should succeed right of anchor"
    # Expected X: anchor_x + anchor_width (aligned to grid cells)
    # Anchor is at col 0, spans 2 cols (0, 1). New object should start at col 2.
    expected_x = (0 + anchor_cols_needed) * TEST_CELL_WIDTH 
    assert placement["x"] == expected_x, f"Expected x={expected_x}, got {placement['x']}"
    # Expected Y: anchor_y (aligned to grid cells, within anchor's height if possible)
    # Anchor is at row 0. New object should be at row 0.
    assert placement["y"] == anchor_y_px, f"Expected y={anchor_y_px}, got {placement['y']}"
    assert placement["width"] == new_obj_width_px
    assert placement["height"] == new_obj_height_px

@pytest.mark.asyncio
async def test_reserve_region_anchor_below(test_allocator):
    alloc, session_id = await test_allocator

    # 1. Place an anchor object (e.g., 1 cell wide, 2 cells high, at grid 0,0)
    anchor_width_px = 1 * TEST_CELL_WIDTH
    anchor_height_px = 2 * TEST_CELL_HEIGHT
    anchor_x_px = 0 * TEST_CELL_WIDTH
    anchor_y_px = 0 * TEST_CELL_HEIGHT

    anchor_cols_needed = math.ceil(anchor_width_px / TEST_CELL_WIDTH)
    anchor_rows_needed = math.ceil(anchor_height_px / TEST_CELL_HEIGHT)
    anchor_region_id = "anchor_obj_2"
    alloc._occupy_block(anchor_region_id, 0, 0, anchor_cols_needed, anchor_rows_needed)

    anchor_bbox = {
        "x": float(anchor_x_px),
        "y": float(anchor_y_px),
        "width": float(anchor_width_px),
        "height": float(anchor_height_px)
    }

    # 2. Request a new object (1x1 cell) to be placed "below" the anchor
    new_obj_width_px = 1 * TEST_CELL_WIDTH
    new_obj_height_px = 1 * TEST_CELL_HEIGHT

    placement = await reserve_region(
        session_id=session_id,
        requested_width=new_obj_width_px,
        requested_height=new_obj_height_px,
        strategy="anchor",
        anchor_object_bbox=anchor_bbox,
        anchor_placement="below"
    )
    
    assert placement is not None, "Placement should succeed below anchor"
    # Expected X: anchor_x (aligned to grid cells, within anchor's width if possible)
    # Anchor is at col 0. New object should be at col 0.
    assert placement["x"] == anchor_x_px, f"Expected x={anchor_x_px}, got {placement['x']}"
    # Expected Y: anchor_y + anchor_height (aligned to grid cells)
    # Anchor is at row 0, spans 2 rows (0, 1). New object should start at row 2.
    expected_y = (0 + anchor_rows_needed) * TEST_CELL_HEIGHT
    assert placement["y"] == expected_y, f"Expected y={expected_y}, got {placement['y']}"
    assert placement["width"] == new_obj_width_px
    assert placement["height"] == new_obj_height_px

@pytest.mark.asyncio
async def test_reserve_region_anchor_right_of_no_space(test_allocator):
    alloc, session_id = await test_allocator
    # Occupy entire last column to block "right-of" placement
    for r in range(TEST_GRID_ROWS):
        alloc._occupy_block(f"blocker_{r}", TEST_GRID_COLS -1, r, 1, 1)

    # Anchor object at second to last column
    anchor_width_px = TEST_CELL_WIDTH
    anchor_height_px = TEST_CELL_HEIGHT
    anchor_x_px = (TEST_GRID_COLS - 2) * TEST_CELL_WIDTH 
    anchor_y_px = 0 * TEST_CELL_HEIGHT
    alloc._occupy_block("anchor_edge", TEST_GRID_COLS - 2, 0, 1, 1)
    
    anchor_bbox = {"x": float(anchor_x_px), "y": float(anchor_y_px), "width": float(anchor_width_px), "height": float(anchor_height_px)}

    placement = await reserve_region(
        session_id=session_id, requested_width=TEST_CELL_WIDTH, requested_height=TEST_CELL_HEIGHT,
        strategy="anchor", anchor_object_bbox=anchor_bbox, anchor_placement="right-of"
    )
    assert placement is None, "Placement should fail if no space right-of anchor"

@pytest.mark.asyncio
async def test_reserve_region_anchor_below_no_space(test_allocator):
    alloc, session_id = await test_allocator
    # Occupy entire last row
    for c in range(TEST_GRID_COLS):
        alloc._occupy_block(f"blocker_bottom_{c}", c, TEST_GRID_ROWS -1, 1, 1)

    # Anchor object at second to last row
    anchor_width_px = TEST_CELL_WIDTH
    anchor_height_px = TEST_CELL_HEIGHT
    anchor_x_px = 0 * TEST_CELL_WIDTH
    anchor_y_px = (TEST_GRID_ROWS - 2) * TEST_CELL_HEIGHT
    alloc._occupy_block("anchor_bottom_edge", 0, TEST_GRID_ROWS - 2, 1, 1)

    anchor_bbox = {"x": float(anchor_x_px), "y": float(anchor_y_px), "width": float(anchor_width_px), "height": float(anchor_height_px)}

    placement = await reserve_region(
        session_id=session_id, requested_width=TEST_CELL_WIDTH, requested_height=TEST_CELL_HEIGHT,
        strategy="anchor", anchor_object_bbox=anchor_bbox, anchor_placement="below"
    )
    assert placement is None, "Placement should fail if no space below anchor"

@pytest.mark.asyncio
async def test_release_region_makes_space_available(test_allocator):
    alloc, session_id = await test_allocator
    # Fill the first cell
    initial_placement = await reserve_region(session_id, TEST_CELL_WIDTH, TEST_CELL_HEIGHT, strategy="flow")
    assert initial_placement is not None
    assert initial_placement["x"] == 0 and initial_placement["y"] == 0
    region_to_release = initial_placement["regionId"]

    # Try to place another object of same size, should go to next cell
    second_placement = await reserve_region(session_id, TEST_CELL_WIDTH, TEST_CELL_HEIGHT, strategy="flow")
    assert second_placement is not None
    assert second_placement["x"] == TEST_CELL_WIDTH # Assumes it goes to (0,1) i.e. x=100, y=0
    assert second_placement["y"] == 0

    # Release the first region
    await release_region(session_id, region_to_release)

    # Try to place again, should now get the first cell (0,0)
    third_placement = await reserve_region(session_id, TEST_CELL_WIDTH, TEST_CELL_HEIGHT, strategy="flow")
    assert third_placement is not None
    assert third_placement["x"] == 0
    assert third_placement["y"] == 0
    assert third_placement["regionId"] != region_to_release # Should be a new regionId 