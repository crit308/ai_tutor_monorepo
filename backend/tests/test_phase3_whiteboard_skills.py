import pytest

from ai_tutor.skills import highlight_object, show_pointer_at, style_token


@pytest.mark.asyncio
async def test_highlight_object_basic():
    """highlight_object should return a valid HIGHLIGHT_OBJECT action dict."""
    obj_id = "rect-42"
    result = await highlight_object.__original_func__(None, object_id=obj_id, color_token="primary", pulse=True)
    assert result["type"] == "HIGHLIGHT_OBJECT"
    assert result["targetObjectId"] == obj_id
    assert result["pulse"] is True
    # Ensure color resolved from token matches style_token helper
    hex_colour = await style_token.__original_func__(token="primary")
    assert result["color"] == hex_colour


@pytest.mark.asyncio
async def test_show_pointer_at_basic():
    """show_pointer_at returns a dict with expected keys and colour resolution."""
    x, y = 150, 200
    pointer_id = "ai-pointer"
    result = await show_pointer_at.__original_func__(None, x=x, y=y, pointer_id=pointer_id, duration_ms=2500, color_token="accent")
    assert result["type"] == "SHOW_POINTER_AT"
    assert result["x"] == x and result["y"] == y
    assert result["pointerId"] == pointer_id
    assert result["durationMs"] == 2500
    expected_color = await style_token.__original_func__(token="accent")
    assert result["color"] == expected_color 