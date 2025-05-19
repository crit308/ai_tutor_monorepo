import json

import pytest

from ai_tutor.services.whiteboard_utils import compress_board_objects, board_summary

EXAMPLE_OBJECTS = [
    {
        "id": "obj1",
        "metadata": {
            "semantic_tags": ["math", "geometry"],
            "bbox": (10, 10, 100, 50),
        },
    },
    {
        "id": "obj2",
        "metadata": {
            "semantic_tags": [],
            "bbox": (200, 200, 20, 20),
        },
    },
]


def test_compress_ids_tags_bbox():
    summary_json = compress_board_objects(EXAMPLE_OBJECTS)
    summary = json.loads(summary_json)

    # Should have two entries corresponding to objects
    assert len(summary) == 2

    first = next(item for item in summary if item["id"] == "obj1")
    assert first["tags"] == ["math", "geometry"]
    assert first["bbox"] == [10, 10, 100, 50]

    second = next(item for item in summary if item["id"] == "obj2")
    # Object2 had no tags so "tags" key might be absent
    assert second["bbox"] == [200, 200, 20, 20]


def test_empty_objects():
    summary_json = compress_board_objects([])
    assert summary_json == "[]"


def test_unsupported_strategy():
    summary_json = compress_board_objects(EXAMPLE_OBJECTS, strategy="unknown")
    assert summary_json == "[]"


def test_board_summary_alias():
    alias_json = board_summary(EXAMPLE_OBJECTS)
    direct_json = compress_board_objects(EXAMPLE_OBJECTS)
    assert alias_json == direct_json 