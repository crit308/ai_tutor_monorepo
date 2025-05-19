import pytest
from pydantic import ValidationError
from agent_t.services.whiteboard_metadata import Metadata


def test_metadata_creation_valid():
    """Test successful creation of Metadata with all fields."""
    data = {
        "source": "assistant",
        "role": "interactive_concept",
        "semantic_tags": ["math", "algebra"],
        "bbox": (10.0, 20.0, 100.0, 50.0),
        "group_id": "group1"
    }
    metadata = Metadata(**data)
    assert metadata.source == "assistant"
    assert metadata.role == "interactive_concept"
    assert metadata.semantic_tags == ["math", "algebra"]
    assert metadata.bbox == (10.0, 20.0, 100.0, 50.0)
    assert metadata.group_id == "group1"

def test_metadata_creation_minimal():
    """Test successful creation of Metadata with only required fields."""
    data = {
        "source": "user",
        "role": "question_anchor",
        "bbox": (0.0, 0.0, 10.0, 10.0)
    }
    metadata = Metadata(**data)
    assert metadata.source == "user"
    assert metadata.role == "question_anchor"
    assert metadata.semantic_tags == []  # Default value
    assert metadata.bbox == (0.0, 0.0, 10.0, 10.0)
    assert metadata.group_id is None  # Default value

def test_metadata_invalid_source():
    """Test validation error for invalid 'source' field."""
    with pytest.raises(ValidationError) as excinfo:
        Metadata(
            source="invalid_source",  # type: ignore
            role="test_role",
            bbox=(1.0,1.0,1.0,1.0)
        )
    assert "Input should be 'assistant' or 'user'" in str(excinfo.value)

def test_metadata_missing_required_fields():
    """Test validation error for missing required fields (e.g., role, bbox)."""
    with pytest.raises(ValidationError) as excinfo:
        Metadata(source="assistant") # Missing role and bbox
    assert "'role'" in str(excinfo.value)
    assert "'bbox'" in str(excinfo.value)

def test_metadata_invalid_bbox_type():
    """Test validation error for bbox with incorrect tuple structure/types."""
    with pytest.raises(ValidationError):
        Metadata(source="assistant", role="test", bbox=("str", 10, 20, 30)) # type: ignore
    with pytest.raises(ValidationError):
        Metadata(source="assistant", role="test", bbox=(10, 20, 30)) # type: ignore
    with pytest.raises(ValidationError):
        Metadata(source="assistant", role="test", bbox=(10.0, 20.0, 30.0, "invalid")) # type: ignore

def test_metadata_semantic_tags_default_empty_list():
    """Test that semantic_tags defaults to an empty list if not provided."""
    metadata = Metadata(source="assistant", role="test", bbox=(0,0,1,1))
    assert metadata.semantic_tags == []

def test_metadata_group_id_default_none():
    """Test that group_id defaults to None if not provided."""
    metadata = Metadata(source="user", role="another_role", bbox=(5,5,5,5))
    assert metadata.group_id is None

def test_metadata_bbox_exact_tuple_float():
    """Test that bbox stores exact float values."""
    metadata = Metadata(source="assistant", role="bbox_test", bbox=(10.1, 20.2, 30.3, 40.4))
    assert metadata.bbox == (10.1, 20.2, 30.3, 40.4) 