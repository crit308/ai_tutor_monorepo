"""ai_tutor/services/spatial_index.py

Provides a 2D R-tree index for fast spatial querying of whiteboard objects.
"""
from typing import List, Tuple, Any, Dict, Iterator, Optional

import logging

log = logging.getLogger(__name__)

try:
    from rtree import index as _rtree_index  # type: ignore
    _HAS_RTREE = True
except ImportError:  # pragma: no cover – missing native lib in some envs
    _HAS_RTREE = False
    _rtree_index = None  # type: ignore
    log.warning("rtree package not available – falling back to in-memory bbox list.\n"  # noqa: W291
                "Install via `pip install rtree` and ensure libspatialindex is present "
                "for faster spatial queries.")

# Placeholder for a CanvasObject's bounding box representation in the R-tree
# Typically (minx, miny, maxx, maxy)
BoundingBox = Tuple[float, float, float, float]

class RTreeIndex:
    """Session-scoped 2D spatial index.

    The implementation uses the *rtree* package when available.  If the package
    cannot be imported (e.g. missing native libspatialindex), the class falls
    back to an O(*N*) naïve list walk – still functional but slower.
    """

    def __init__(self) -> None:
        if _HAS_RTREE:
            # Properties can be tuned later (dimensions=2 by default)
            p = _rtree_index.Property()
            p.dimension = 2
            self._rtree = _rtree_index.Index(properties=p)
        else:
            self._rtree = None  # type: ignore
            self._bbox_records: list[tuple[str, BoundingBox]] = []  # Fallback store
        log.debug("RTreeIndex initialised (use_rtree=%s)", _HAS_RTREE)

    # ------------------------------------------------------------------ #
    # Helper
    # ------------------------------------------------------------------ #

    @staticmethod
    def _to_bbox(x: float, y: float, width: float, height: float) -> BoundingBox:
        return (x, y, x + width, y + height)

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def add_object(
        self,
        object_id: str,
        x: float,
        y: float,
        width: float,
        height: float,
    ) -> None:
        """Insert or update *object_id* with its current bounding box."""
        bbox = self._to_bbox(x, y, width, height)
        if _HAS_RTREE:
            # R-tree cannot update – delete then insert
            hash_id = hash(object_id)
            try:
                self._rtree.delete(hash_id, bbox)  # type: ignore[attr-defined]
            except Exception:
                # ignore – might not exist
                pass
            self._rtree.insert(hash_id, bbox, obj=object_id)  # type: ignore[attr-defined]
        else:
            # Remove any previous record with same id
            self._bbox_records = [(oid, bb) for (oid, bb) in self._bbox_records if oid != object_id]
            self._bbox_records.append((object_id, bbox))

    def remove_object(
        self,
        object_id: str,
        x: float,
        y: float,
        width: float,
        height: float,
    ) -> None:
        bbox = self._to_bbox(x, y, width, height)
        if _HAS_RTREE:
            try:
                self._rtree.delete(hash(object_id), bbox)  # type: ignore[attr-defined]
            except Exception:
                pass
        else:
            self._bbox_records = [(oid, bb) for (oid, bb) in self._bbox_records if oid != object_id]

    def query_intersecting_objects(
        self,
        query_x: float,
        query_y: float,
        query_width: float,
        query_height: float,
    ) -> List[str]:
        """Return *ids* whose bbox intersects the query rect (x, y, w, h)."""
        qbbox = self._to_bbox(query_x, query_y, query_width, query_height)
        if _HAS_RTREE:
            hits = self._rtree.intersection(qbbox, objects=True)  # type: ignore[attr-defined]
            return [hit.object for hit in hits]
        else:
            qminx, qminy, qmaxx, qmaxy = qbbox
            hits: list[str] = []
            for oid, (minx, miny, maxx, maxy) in self._bbox_records:
                if (minx < qmaxx and maxx > qminx and miny < qmaxy and maxy > qminy):
                    hits.append(oid)
            return hits

    def clear(self) -> None:
        if _HAS_RTREE:
            # Re-initialise index
            p = _rtree_index.Property()
            p.dimension = 2
            self._rtree = _rtree_index.Index(properties=p)
        else:
            self._bbox_records.clear()


# Convenience singleton per process (sufficient for Phase-2 prototypes)
_DEFAULT_INDEX: Optional[RTreeIndex] = None

def get_index() -> RTreeIndex:
    global _DEFAULT_INDEX
    if _DEFAULT_INDEX is None:
        _DEFAULT_INDEX = RTreeIndex()
    return _DEFAULT_INDEX

# It might be beneficial to have a global or session-specific instance of RTreeIndex.
# For now, this class definition is the focus.
# Consider how this index will be populated and kept in sync with the Yjs whiteboard state.
# Typically, a service or manager would listen to whiteboard updates (ADD, UPDATE, DELETE)
# and call the RTreeIndex methods accordingly.

# Add logging
import logging
log = logging.getLogger(__name__) 