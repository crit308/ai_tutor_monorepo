import pytest
import uuid
from unittest.mock import AsyncMock
from pydantic import ValidationError # Import for context, though ToolInputError is expected

# Assuming ASSISTANT_DRAWING_NAMESPACE is in drawing_tools or a shared constants module
# For the test, we might need to redefine it or mock its import if it's not easily accessible
# For now, let's assume it's accessible via the skill's module or we use the known value.
ASSISTANT_DRAWING_NAMESPACE = uuid.UUID("a1e5a97a-7278-47ce-861d-80971e00de60")

# Path to the module to be tested
# Make sure this path is correct for your project structure for imports
from ai_tutor.skills.drawing_tools import draw_text, DrawTextArgs, _PALETTE
from ai_tutor.exceptions import ToolInputError


@pytest.mark.asyncio
async def test_draw_text_deterministic_id_generation():
    """
    Tests that draw_text generates deterministic IDs when no ID is provided.
    Calling draw_text twice with the same parameters should yield the same object ID.
    """
    ctx_mock = AsyncMock()  # Mock context if needed by the skill for other operations

    params1 = {
        "text": "Hello World",
        "color_token": "primary",
        # Optional params that affect ID if they were part of name_string:
        # "x": 10, "y": 20, "fontSize": 16, "width": 100 
    }
    
    # First call
    object_spec1 = await draw_text.__original_func__(ctx=ctx_mock, **params1)

    # Second call with identical parameters
    object_spec2 = await draw_text.__original_func__(ctx=ctx_mock, **params1)

    assert "id" in object_spec1
    assert "id" in object_spec2
    assert object_spec1["id"] == object_spec2["id"], "Object IDs should be identical for identical inputs."

    # Verify the ID structure (optional, but good for sanity check)
    expected_name_string = f"text-{params1['text']}-{params1['color_token']}"
    expected_id = str(uuid.uuid5(ASSISTANT_DRAWING_NAMESPACE, expected_name_string))
    assert object_spec1["id"] == expected_id, "Generated ID does not match expected deterministic ID."


@pytest.mark.asyncio
async def test_draw_text_uses_provided_id():
    """
    Tests that draw_text uses the ID provided in arguments instead of generating one.
    """
    ctx_mock = AsyncMock()
    provided_id = "custom-id-123"
    params = {
        "id": provided_id,
        "text": "Test Text",
        "color_token": "accent"
    }
    object_spec = await draw_text.__original_func__(ctx=ctx_mock, **params)
    assert object_spec["id"] == provided_id, "draw_text should use the provided ID."


@pytest.mark.asyncio
async def test_draw_text_valid_output_structure():
    """
    Tests that draw_text returns a dictionary with the expected basic structure
    for a CanvasObjectSpec (text kind).
    """
    ctx_mock = AsyncMock()
    params = {
        "text": "Sample Text",
        "x": 50,
        "y": 70,
        "fontSize": 12,
        "width": 150,
        "color_token": "muted",
    }
    object_spec = await draw_text.__original_func__(ctx=ctx_mock, **params)

    assert object_spec["kind"] == "text"
    assert object_spec["text"] == params["text"]
    assert object_spec["x"] == params["x"]
    assert object_spec["y"] == params["y"]
    assert object_spec["fontSize"] == params["fontSize"]
    assert object_spec["width"] == params["width"]
    assert "fill" in object_spec
    assert object_spec["fill"] == _PALETTE[params["color_token"]]
    assert "metadata" in object_spec
    assert object_spec["metadata"]["source"] == "assistant"


@pytest.mark.asyncio
async def test_draw_text_minimal_args():
    """
    Tests draw_text with only required arguments (text).
    Other arguments should get default values or be handled gracefully.
    """
    ctx_mock = AsyncMock()
    params = {"text": "Minimal"}
    object_spec = await draw_text.__original_func__(ctx=ctx_mock, **params)

    assert object_spec["text"] == params["text"]
    assert object_spec["kind"] == "text"
    assert "id" in object_spec # Deterministic ID should be generated
    assert "x" in object_spec # Default layout position
    assert "y" in object_spec # Default layout position
    assert "fill" in object_spec # Default color_token leads to a fill
    assert object_spec["metadata"]["source"] == "assistant"
    # fontSize and width might be absent if not provided and not defaulted in spec
    assert "fontSize" not in object_spec or object_spec["fontSize"] is None
    assert "width" not in object_spec or object_spec["width"] is None


@pytest.mark.asyncio
async def test_draw_text_invalid_input_raises_error():
    """
    Tests that draw_text raises ToolInputError for invalid parameters
    (e.g., missing text, invalid color_token).
    """
    ctx_mock = AsyncMock()
    
    # Missing text (should be caught by Pydantic within DrawTextArgs and result in ToolInputError)
    with pytest.raises(ToolInputError):
        await draw_text.__original_func__(ctx=ctx_mock, color_token="primary")

    # Invalid color_token (Pydantic model DrawTextArgs catches this, skill re-raises as ToolInputError)
    with pytest.raises(ToolInputError):
        await draw_text.__original_func__(ctx=ctx_mock, text="Test", color_token="non_existent_color")

    # Invalid fontSize (e.g., negative, caught by Pydantic Field gt=0)
    with pytest.raises(ToolInputError):
        await draw_text.__original_func__(ctx=ctx_mock, text="Test", fontSize=-5)

    # Invalid text (e.g., not a string, or empty if min_length=1 is effective)
    # DrawTextArgs has `text: str = Field(..., min_length=1)`
    with pytest.raises(ToolInputError):
        await draw_text.__original_func__(ctx=ctx_mock, text="") # Empty string

    with pytest.raises(ToolInputError):
        await draw_text.__original_func__(ctx=ctx_mock, text=123) # type: ignore # Wrong type

# Ensure pydantic.ValidationError is imported if still using conditional logic, 
# but direct ToolInputError expectation is cleaner per skill's behavior.
# from pydantic import ValidationError # if testing for direct pydantic error 