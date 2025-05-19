from __future__ import annotations

"""ai_tutor/routers/board_summary.py

Provides an HTTP endpoint that returns an *LLM-friendly* summary (digest)
of the current whiteboard state for a given tutoring session.

Phase-1 implementation goals:
  • Parse the Yjs document from Redis (authoritative store) into structured
    `CanvasObjectSpec` dictionaries.
  • Derive aggregate counts by `kind` and `owner`.
  • Extract learner-originated question tags (objects where
    `metadata.role == 'question_tag'`).
  • Compute a bounding-box for each *concept* cluster where objects share
    the same `metadata.concept` value.

The endpoint path mirrors other Session-scoped resources::

    GET /api/v1/sessions/{session_id}/board_summary

Return payload schema (subject to change as we iterate):
```json
{
  "counts": {
      "by_kind": {"text": 12, "rect": 3, ...},
      "by_owner": {"assistant": 15, "user": 4}
  },
  "learner_question_tags": [
      {"id": "qtag-123", "x": 120, "y": 200}
  ],
  "concept_clusters": [
      {"concept": "water_cycle", "bbox": [x1, y1, x2, y2], "count": 8 }
  ]
}
```
"""

import logging
from collections import Counter, defaultdict
from typing import Any, Dict, List, Tuple
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from supabase import Client
from redis.asyncio import Redis  # type: ignore
from y_py import YDoc, apply_update  # type: ignore

from ai_tutor.dependencies import get_supabase_client, get_redis_client
from ai_tutor.auth import verify_token

log = logging.getLogger(__name__)

router = APIRouter(tags=["Whiteboard"])

_REDIS_KEY_PREFIX = "yjs:snapshot:"


@router.get(
    "/sessions/{session_id}/board_summary",
    summary="Return a concise summary of the whiteboard for the given session",
)
async def get_board_summary(
    request: Request,
    session_id: UUID,
    supabase: Client = Depends(get_supabase_client),
    redis: Redis = Depends(get_redis_client),
):
    """Return an aggregated digest of the current whiteboard state.

    The caller must be the owner of *session_id* (enforced via RLS + explicit
    check for clarity).
    """

    # ------------------------------------------------------------------
    # 1️⃣  Authorisation – ensure the authed user owns this session
    # ------------------------------------------------------------------
    user = request.state.user  # Populated by `verify_token` dependency

    # Although Supabase RLS safeguards apply to table selects, we perform an
    # explicit check for parity with the WebSocket authorisation logic.
    try:
        chk = (
            supabase.table("sessions")
            .select("id")
            .eq("id", str(session_id))
            .eq("user_id", str(user.id))
            .maybe_single()
            .execute()
        )
        if not chk.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        log.error("[board_summary] DB lookup error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal error")

    # ------------------------------------------------------------------
    # 2️⃣  Load latest Yjs snapshot from Redis
    # ------------------------------------------------------------------
    redis_key = f"{_REDIS_KEY_PREFIX}{session_id}"
    snapshot_bytes: bytes | None = await redis.get(redis_key)  # type: ignore[arg-type]

    if not snapshot_bytes:
        # No whiteboard content yet – return empty digest
        return {
            "counts": {"by_kind": {}, "by_owner": {}},
            "learner_question_tags": [],
            "concept_clusters": [],
        }

    # ------------------------------------------------------------------
    # 3️⃣  Decode Yjs document and extract CanvasObjectSpec map
    # ------------------------------------------------------------------
    ydoc = YDoc()
    try:
        with ydoc.begin_transaction() as txn:
            apply_update(txn, snapshot_bytes)

        with ydoc.begin_transaction() as txn:
            ymap = ydoc.get_map("objects")  # type: ignore[arg-type]
            # Convert to regular Python dict – YMap behaves like Mapping
            objects: List[Dict[str, Any]] = [ymap[key] for key in ymap.keys()]
    except Exception as exc:  # pragma: no cover
        log.error("[board_summary] Failed to decode Yjs snapshot: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal error")

    # ------------------------------------------------------------------
    # 4️⃣  Derive digest fields
    # ------------------------------------------------------------------
    by_kind: Counter[str] = Counter()
    by_owner: Counter[str] = Counter()
    learner_tags: List[Dict[str, Any]] = []

    # concept -> list[(bbox)] where bbox=(x1,y1,x2,y2)
    concept_bboxes: Dict[str, List[Tuple[float, float, float, float]]] = defaultdict(list)

    for spec in objects:
        kind = spec.get("kind") or "unknown"
        owner = (spec.get("metadata") or {}).get("source") or "unknown"
        by_kind[kind] += 1
        by_owner[owner] += 1

        md = spec.get("metadata") or {}
        role = md.get("role")
        concept = md.get("concept")

        if role == "question_tag":
            learner_tags.append({
                "id": spec.get("id"),
                "x": spec.get("x"),
                "y": spec.get("y"),
                "meta": md,
            })

        # Bounding box calculation – require x, y, width, height
        if concept:
            try:
                x = float(spec.get("x") or 0)
                y = float(spec.get("y") or 0)
                w = float(spec.get("width") or 0)
                h = float(spec.get("height") or 0)
                concept_bboxes[concept].append((x, y, x + w, y + h))
            except Exception:
                # Ignore specs with non-numeric bbox
                pass

    # Merge bboxes per concept to get envelopes
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

    # --- 5️⃣ Ephemeral summary from 'ephemeral' Yjs map ---
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
        "counts": {
            "by_kind": dict(by_kind),
            "by_owner": dict(by_owner),
        },
        "learner_question_tags": learner_tags,
        "concept_clusters": concept_clusters,
        "ephemeralSummary": {
            "activeHighlights": active_highlights,
            "activeQuestionTags": active_question_tags,
            "recentPointer": recent_pointer,
        },
    } 