from __future__ import annotations

# --- ai_tutor/routers/whiteboard_ws.py ---
# WebSocket endpoint that implements Phase-0 Yjs delta synchronisation for the shared
# whiteboard document.  This endpoint is intentionally minimal: it receives raw Yjs
# binary updates from each connected client, applies them to the authoritative
# server-side YDoc, and immediately relays the same binary payload to all other
# clients connected to the *same* session.  When the last client disconnects the
# current state vector is persisted to a local file so that it can be restored on
# the next connection (a more robust Redis-based implementation will follow in
# Phase-1).
#
#   Route:  /ws/v2/session/{session_id}/whiteboard
#
# Security & tenancy rules mirror those of the existing tutor_ws endpoint: the
# client must include a valid Supabase JWT (either via the standard
# `Authorization: Bearer <token>` header or a `?token=` query parameter).
#
# NOTE: For now Yjs messages are treated as opaque binary blobs – the server does
# not attempt to *interpret* them, it merely applies them to a YDoc instance via
# y-py so that subsequent incremental updates can be computed when needed in
# Phase-1.  This keeps the Phase-0 implementation very small while still giving
# us a fully-working delta-sync channel that can be exercised from the frontend.

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from uuid import UUID
from y_py import YDoc, apply_update, encode_state_as_update  # type: ignore
import asyncio
import logging
import os
from typing import Dict, Set
import time

from ai_tutor.dependencies import get_supabase_client, get_redis_client
from supabase import Client
from redis.asyncio import Redis  # type: ignore

# We reuse the private helper from the chat WebSocket router for JWT validation.
from ai_tutor.routers.tutor_ws import _authenticate_ws  # pylint: disable=protected-access

log = logging.getLogger(__name__)

router = APIRouter(prefix="/ws/v2")  # Final path = /ws/v2/session/{id}/whiteboard

# ---------------------- In-memory document registry ---------------------- #

class _SessionDoc:
    """Holds the YDoc and the set of active websocket connections for a session."""

    def __init__(self) -> None:
        self.ydoc: YDoc = YDoc()
        self.connections: Set[WebSocket] = set()
        # Lock to ensure that apply/broadcast is atomic when many clients send
        # concurrently.  The lock is per-session so parallel sessions are not
        # blocked.
        self._lock = asyncio.Lock()


# session_id (str)  ->  _SessionDoc
_docs: Dict[str, _SessionDoc] = {}

# Key prefix for Yjs snapshots in Redis
_REDIS_KEY_PREFIX = "yjs:snapshot:"

# ---------------------------- Helper utils ----------------------------- #

async def _get_or_create_doc(session_id: str, redis: Redis) -> _SessionDoc:
    """Return the in-memory `_SessionDoc` for *session_id*, loading its last
    snapshot from Redis if it is not already in `_docs`."""

    if session_id in _docs:
        return _docs[session_id]

    doc_wrapper = _SessionDoc()

    # Attempt to hydrate from Redis (Phase-1 persistence strategy)
    redis_key = f"{_REDIS_KEY_PREFIX}{session_id}"
    try:
        snapshot_bytes: bytes | None = await redis.get(redis_key)  # type: ignore[arg-type]
        if snapshot_bytes:
            with doc_wrapper.ydoc.begin_transaction() as txn:
                apply_update(txn, snapshot_bytes)
            log.info(
                "[whiteboard_ws] Restored YDoc for %s from Redis snapshot (%d bytes)",
                session_id,
                len(snapshot_bytes),
            )
    except Exception as exc:  # pragma: no cover
        log.error("[whiteboard_ws] Failed to load Redis snapshot for %s: %s", session_id, exc, exc_info=True)

    _docs[session_id] = doc_wrapper
    return doc_wrapper


async def _broadcast(update: bytes, peers: Set[WebSocket], origin: WebSocket) -> None:
    """Send *update* to every websocket in *peers* except *origin*."""
    dead: Set[WebSocket] = set()
    for peer in peers:
        if peer is origin:
            continue
        try:
            await peer.send_bytes(update)
        except WebSocketDisconnect:
            dead.add(peer)
        except RuntimeError:
            dead.add(peer)
        except Exception as exc:  # pragma: no cover
            log.error("[whiteboard_ws] Unexpected send error: %s", exc, exc_info=True)
            dead.add(peer)
    # Prune connections that are no longer alive
    peers.difference_update(dead)


# ----------------------------- Endpoint ------------------------------ #

@router.websocket("/session/{session_id}/whiteboard")
async def whiteboard_stream(
    ws: WebSocket,
    session_id: UUID,
    supabase: Client = Depends(get_supabase_client),
    redis: Redis = Depends(get_redis_client),
):
    """Primary Yjs delta-sync channel for the collaborative whiteboard."""

    # -------- 1️⃣  Authentication -------- #
    try:
        user = await _authenticate_ws(ws, supabase)
        log.info("[whiteboard_ws] Auth successful – user=%s, session=%s", user.id if user else "?", session_id)
    except Exception as auth_err:  # pragma: no cover
        log.warning("[whiteboard_ws] Auth failed: %s", auth_err)
        return  # FastAPI will close the socket automatically

    await ws.accept()

    # -------- 1b️⃣  Basic tenancy guard -------- #
    try:
        # Verify that the session row belongs to the authenticated user to prevent cross-tenant leaks.
        check = (
            supabase.table("sessions")
            .select("id")
            .eq("id", str(session_id))
            .eq("user_id", str(user.id))
            .maybe_single()
            .execute()
        )
        if not check.data:
            await ws.close(code=4403, reason="Forbidden: session does not belong to user")
            log.warning("[whiteboard_ws] Forbidden access – user %s attempted to access session %s", user.id, session_id)
            return
    except Exception as exc:  # pragma: no cover
        log.error("[whiteboard_ws] Error during tenancy guard lookup: %s", exc, exc_info=True)
        await ws.close(code=1011, reason="Internal error")
        return

    session_key = str(session_id)
    doc_wrapper = await _get_or_create_doc(session_key, redis)
    doc_wrapper.connections.add(ws)

    # -------- 2️⃣  Send initial state (if any) -------- #
    try:
        with doc_wrapper.ydoc.begin_transaction() as txn:
            state_bytes = encode_state_as_update(txn)
        if state_bytes:
            await ws.send_bytes(state_bytes)
            log.debug("[whiteboard_ws] Sent initial state (%d bytes) to client", len(state_bytes))
    except Exception as exc:  # pragma: no cover
        log.error("[whiteboard_ws] Failed to send initial state: %s", exc, exc_info=True)

    # -------- 3️⃣  Main receive loop -------- #
    try:
        while True:
            try:
                update_bytes = await ws.receive_bytes()
            except WebSocketDisconnect:
                break
            except RuntimeError:  # Socket closed
                break
            except Exception as recv_err:  # pragma: no cover
                log.error("[whiteboard_ws] Error receiving message: %s", recv_err, exc_info=True)
                break

            # Apply + broadcast under lock so ordering is consistent
            async with doc_wrapper._lock:
                try:
                    with doc_wrapper.ydoc.begin_transaction() as txn:
                        apply_update(txn, update_bytes)
                except Exception as parse_err:  # pragma: no cover
                    log.error("[whiteboard_ws] Failed to apply Yjs update: %s", parse_err, exc_info=True)
                    continue

                # --- 🚦  Owner-field validation & sanitisation ------------- #
                try:
                    # Learner-side clients are only authorised to write objects
                    # whose metadata.source == "user".  We iterate over every
                    # object to enforce the invariant; if a malicious client
                    # tries to spoof `source:"assistant"` we rewrite it.
                    VALID_SOURCE = "user"
                    ymap = doc_wrapper.ydoc.get_map("objects")  # type: ignore[arg-type]
                    to_patch: list[tuple[str, dict]] = []
                    for key in ymap.keys():
                        spec = ymap[key]
                        if not isinstance(spec, dict):
                            continue  # Unexpected type
                        md = spec.get("metadata") or {}
                        if md.get("source") != VALID_SOURCE:
                            md["source"] = VALID_SOURCE
                            spec["metadata"] = md
                            to_patch.append((key, spec))

                    # Apply sanitised specs back if needed
                    if to_patch:
                        with doc_wrapper.ydoc.begin_transaction() as patch_txn:
                            for k, patched_spec in to_patch:
                                ymap.set(k, patched_spec, txn=patch_txn)  # type: ignore[arg-type]
                        log.warning(
                            "[whiteboard_ws] Sanitised %d object(s) with invalid owner field from client %s",
                            len(to_patch),
                            user.id,
                        )
                except Exception as val_err:  # pragma: no cover
                    log.error("[whiteboard_ws] Validation error: %s", val_err, exc_info=True)

                # --- Broadcast to peers (excluding origin) --- #
                await _broadcast(update_bytes, doc_wrapper.connections, ws)

                # --- Persist latest snapshot to Redis --- #
                try:
                    with doc_wrapper.ydoc.begin_transaction() as s_txn:
                        snapshot = encode_state_as_update(s_txn)
                    redis_key = f"{_REDIS_KEY_PREFIX}{session_key}"
                    # Use SET with no expiry for now; expiry policy can be tuned outside.
                    await redis.set(redis_key, snapshot)
                except Exception as persist_err:  # pragma: no cover
                    log.error(
                        "[whiteboard_ws] Redis persist failed for %s: %s",
                        session_key,
                        persist_err,
                        exc_info=True,
                    )
    finally:
        # --- Cleanup on disconnect --- #
        doc_wrapper.connections.discard(ws)
        if not doc_wrapper.connections:
            # Persist snapshot one last time, then free RAM.
            try:
                with doc_wrapper.ydoc.begin_transaction() as txn:
                    snapshot = encode_state_as_update(txn)
                redis_key = f"{_REDIS_KEY_PREFIX}{session_key}"
                await redis.set(redis_key, snapshot)
                log.info(
                    "[whiteboard_ws] Final Redis snapshot persisted for %s (%d bytes)",
                    session_key,
                    len(snapshot),
                )
            except Exception as persist_err:  # pragma: no cover
                log.error(
                    "[whiteboard_ws] Failed to persist snapshot for %s: %s",
                    session_key,
                    persist_err,
                    exc_info=True,
                )

            # Remove from in-memory registry
            _docs.pop(session_key, None)

# ---------------- Ephemeral GC Loop ----------------
async def _gc_ephemeral_loop(interval_s: int = 10):
    """Periodically garbage-collect expired ephemeral entries from Yjs docs."""
    while True:
        await asyncio.sleep(interval_s)
        now = time.time() * 1000
        for wrapper in _docs.values():
            try:
                with wrapper.ydoc.begin_transaction() as txn:
                    eph_map = wrapper.ydoc.get_map("ephemeral")  # type: ignore[arg-type]
                    for key in list(eph_map.keys()):
                        spec = eph_map.get(key) or {}
                        md = spec.get("metadata") or {}
                        if md.get("expiresAt", 0) < now:
                            del eph_map[key]
            except Exception as e:
                log.error("[whiteboard_ws] Ephemeral GC error: %s", e, exc_info=True)


def start_ephemeral_gc(interval_s: int = 10):
    """Start the background ephemeral GC loop."""
    asyncio.create_task(_gc_ephemeral_loop(interval_s)) 