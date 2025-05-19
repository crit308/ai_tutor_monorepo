from __future__ import annotations

"""ai_tutor/skills/get_board_summary.py

Phase-1 replacement for the old *get_board_state* skill.
Returns a concise, structured digest of the whiteboard so the LLM can
reason about what is currently on the board without receiving the full
object list.

The implementation mirrors the logic of
`routers/board_summary.get_board_summary` but runs directly inside the
skill layer so that the tutor can obtain the digest without issuing an
HTTP call.
"""

import logging
from collections import Counter, defaultdict
from typing import Any, Dict, List, Tuple

from y_py import YDoc, apply_update  # type: ignore

from ai_tutor.skills import skill
from ai_tutor.context import TutorContext
from agents.run_context import RunContextWrapper
from ai_tutor.dependencies import get_redis_client

log = logging.getLogger(__name__)

_REDIS_KEY_PREFIX = "yjs:snapshot:"

@skill(name_override="get_board_summary")
async def get_board_summary_skill(ctx: RunContextWrapper[TutorContext]) -> Dict[str, Any]:
    """Return an LLM-friendly summary of the current whiteboard.

    The summary contains:
        counts.by_kind – number of objects per `kind`.
        counts.by_owner – number of objects grouped by metadata.source.
        learner_question_tags – list of question_tag objects placed by the learner.
        concept_clusters – bounding-boxes for objects that share the same
                            metadata.concept label.
    """

    session_id = ctx.context.session_id
    redis = await get_redis_client()

    redis_key = f"{_REDIS_KEY_PREFIX}{session_id}"
    snapshot_bytes: bytes | None = await redis.get(redis_key)  # type: ignore[arg-type]

    if not snapshot_bytes:
        return {
            "counts": {"by_kind": {}, "by_owner": {}},
            "learner_question_tags": [],
            "concept_clusters": [],
        }

    # Decode snapshot
    ydoc = YDoc()
    try:
        with ydoc.begin_transaction() as txn:
            apply_update(txn, snapshot_bytes)

        with ydoc.begin_transaction() as txn:
            ymap = ydoc.get_map("objects")  # type: ignore[arg-type]
            objects: List[Dict[str, Any]] = [ymap[k] for k in ymap.keys()]
    except Exception as exc:
        log.error("[get_board_summary] Failed to decode Yjs snapshot: %s", exc, exc_info=True)
        return {
            "error": "failed_to_decode_snapshot",
            "detail": str(exc),
        }

    # Aggregate
    by_kind: Counter[str] = Counter()
    by_owner: Counter[str] = Counter()
    learner_tags: List[Dict[str, Any]] = []
    concept_bboxes: Dict[str, List[Tuple[float, float, float, float]]] = defaultdict(list)

    for spec in objects:
        kind = spec.get("kind") or "unknown"
        owner = (spec.get("metadata") or {}).get("source") or "unknown"
        by_kind[kind] += 1
        by_owner[owner] += 1

        md = spec.get("metadata") or {}
        if md.get("role") == "question_tag":
            learner_tags.append({
                "id": spec.get("id"),
                "x": spec.get("x"),
                "y": spec.get("y"),
                "meta": md,
            })

        concept = md.get("concept")
        if concept:
            try:
                x = float(spec.get("x") or 0)
                y = float(spec.get("y") or 0)
                w = float(spec.get("width") or 0)
                h = float(spec.get("height") or 0)
                concept_bboxes[concept].append((x, y, x + w, y + h))
            except Exception:
                pass

    concept_clusters: List[Dict[str, Any]] = []
    for concept, boxes in concept_bboxes.items():
        if not boxes:
            continue
        min_x = min(b[0] for b in boxes)
        min_y = min(b[1] for b in boxes)
        max_x = max(b[2] for b in boxes)
        max_y = max(b[3] for b in boxes)
        concept_clusters.append({
            "concept": concept,
            "bbox": [min_x, min_y, max_x, max_y],
            "count": len(boxes),
        })

    # --- Ephemeral summary from 'ephemeral' Yjs map ---
    with ydoc.begin_transaction() as txn:
        eph_map = ydoc.get_map("ephemeral")  # type: ignore[arg-type]
        eph_objs: List[Dict[str, Any]] = [eph_map[key] for key in eph_map.keys()]
    active_highlights = sum(1 for spec in eph_objs if spec.get("kind") == "highlight_stroke")
    active_question_tags = [
        {"id": spec.get("id"), "linkedObjectId": (spec.get("metadata") or {}).get("linkedObjectId")}
        for spec in eph_objs if spec.get("kind") == "question_tag"
    ]
    recent_pings = [spec for spec in eph_objs if spec.get("kind") == "pointer_ping"]
    recent_pointer = None
    if recent_pings:
        recent_spec = max(recent_pings, key=lambda s: (s.get("metadata") or {}).get("expiresAt", 0))
        recent_pointer = {"x": recent_spec.get("x"), "y": recent_spec.get("y"), "meta": recent_spec.get("metadata")}

    return {
        "counts": {"by_kind": dict(by_kind), "by_owner": dict(by_owner)},
        "learner_question_tags": learner_tags,
        "concept_clusters": concept_clusters,
        "ephemeralSummary": {
            "activeHighlights": active_highlights,
            "activeQuestionTags": active_question_tags,
            "recentPointer": recent_pointer,
        },
    } 