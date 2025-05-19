import pytest

from ai_tutor.skills.layout_board_ops import _matches_meta
from ai_tutor.services.spatial_index import RTreeIndex

EXAMPLE_OBJECTS = [
    {
        "id": "o1",
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100,
        "metadata": {"role": "diagram", "semantic_tags": ["physics"], "bbox": (0, 0, 100, 100)},
    },
    {
        "id": "o2",
        "x": 150,
        "y": 0,
        "width": 50,
        "height": 50,
        "metadata": {"role": "annotation", "semantic_tags": ["note"], "bbox": (150, 0, 50, 50)},
    },
]


def build_index(objs):
    idx = RTreeIndex()
    for obj in objs:
        idx.add_object(obj["id"], obj["x"], obj["y"], obj["width"], obj["height"])
    return idx


@pytest.mark.parametrize("meta_query,expected_ids", [
    ({"role": "diagram"}, {"o1"}),
    ({"role": "annotation"}, {"o2"}),
    ({"role": "missing"}, set()),
])
def test_matches_meta(meta_query, expected_ids):
    filtered = {obj["id"] for obj in EXAMPLE_OBJECTS if _matches_meta(obj, meta_query)}
    assert filtered == expected_ids


def test_spatial_only():
    idx = build_index(EXAMPLE_OBJECTS)
    # Query area intersects only o2
    ids = set(idx.query_intersecting_objects(150, 0, 10, 10))
    assert ids == {"o2"}


def test_meta_and_spatial():
    idx = build_index(EXAMPLE_OBJECTS)
    spatial_ids = set(idx.query_intersecting_objects(0, 0, 200, 200))
    # Should include both objects
    assert spatial_ids == {"o1", "o2"}

    meta_ids = {obj["id"] for obj in EXAMPLE_OBJECTS if _matches_meta(obj, {"role": "diagram"})}
    # Intersection should be only o1
    assert spatial_ids & meta_ids == {"o1"} 