import pytest
from fastapi.testclient import TestClient
from uuid import uuid4


# --- Dummy Convex Client ------------------------------------------------- #


class DummyConvex:
    """In-memory imitation of Convex client."""

    def __init__(self):
        self.storage: dict[str, list] = {
            "session_messages": [],
            "whiteboard_snapshots": [],
        }

    async def query(self, name: str, args: dict):
        if name == "list_session_messages":
            rows = [r for r in self.storage["session_messages"] if r["session_id"] == args["session_id"]]
            if args.get("before_turn_no") is not None:
                rows = [r for r in rows if r.get("turn_no", 0) < args["before_turn_no"]]
            rows = sorted(rows, key=lambda r: r["turn_no"], reverse=True)
            rows = rows[: args.get("limit", len(rows))]
            rows.reverse()
            return rows
        elif name == "list_whiteboard_snapshots":
            rows = [
                r
                for r in self.storage["whiteboard_snapshots"]
                if r["session_id"] == args["session_id"] and r["snapshot_index"] <= args["target_snapshot_index"]
            ]
            rows.sort(key=lambda r: r["snapshot_index"])
            return rows
        return []

    async def mutation(self, name: str, args: dict):
        if name == "insert_session_message":
            self.storage["session_messages"].append(args)
        elif name == "insert_snapshot":
            self.storage["whiteboard_snapshots"].append(args)
        else:
            raise ValueError(name)


# ------------------------------------------------------------------------- #


@pytest.fixture
def client_with_dummy_convex(monkeypatch):
    """Provides FastAPI TestClient with Convex + auth deps overridden."""

    # --- Patch 'openai' to a minimal stub before importing backend modules --- #
    import sys, types

    fake_openai = types.ModuleType("openai")

    class _DummyAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def close(self):
            pass

        @property
        def is_closed(self):
            return False

    fake_openai.AsyncOpenAI = _DummyAsyncClient  # type: ignore[attr-defined]

    # Provide submodule _base_client with AsyncHttpxClientWrapper stub
    base_client = types.ModuleType("openai._base_client")

    class _DummyWrapper:
        def __del__(self):
            pass

    base_client.AsyncHttpxClientWrapper = _DummyWrapper  # type: ignore[attr-defined]
    fake_openai._base_client = base_client

    sys.modules.setdefault("openai", fake_openai)
    sys.modules.setdefault("openai._base_client", base_client)

    from ai_tutor.api import app
    from ai_tutor.dependencies import get_convex_client
    from ai_tutor.auth import verify_token
    from fastapi import Request

    dummy = DummyConvex()

    # Override Convex dependency
    app.dependency_overrides[get_convex_client] = lambda: dummy

    # Override auth dependency to inject fake user into request.state
    async def _fake_verify_token(request: Request, supabase=None):
        class _User:
            id = uuid4()

        request.state.user = _User()
        return _User()

    app.dependency_overrides[verify_token] = _fake_verify_token

    yield TestClient(app), dummy

    # Clean overrides afterwards
    app.dependency_overrides.clear()


# ------------------------------------------------------------------------- #


def _seed_data(dummy: DummyConvex, session_id):
    """Populate dummy DB with deterministic message & snapshot rows."""

    # Seed session_messages (turn 1-5)
    for turn in range(1, 6):
        role = "user" if turn % 2 == 1 else "assistant"
        dummy.storage["session_messages"].append(
            {
                "session_id": str(session_id),
                "turn_no": turn,
                "role": role,
                "text": f"m{turn}",
                "payload_json": {"key": turn} if role == "assistant" else None,
                "whiteboard_snapshot_index": None,
            }
        )

    # Seed whiteboard snapshots at 1 and 3
    for idx in [1, 3]:
        dummy.storage["whiteboard_snapshots"].append(
            {
                "session_id": str(session_id),
                "snapshot_index": idx,
                "actions_json": [{"action": f"a{idx}"}],
            }
        )


# ------------------------------------------------------------------------- #


def test_chat_history_pagination(client_with_dummy_convex):
    client, dummy = client_with_dummy_convex

    session_id = uuid4()
    _seed_data(dummy, session_id)

    # Request last 2 messages before turn 5 (should yield turns 3 & 4)
    resp = client.get(
        f"/api/v1/sessions/{session_id}/messages",
        params={"before_turn_no": 5, "limit": 2},
        headers={"Authorization": "Bearer faketoken"},
    )

    assert resp.status_code == 200, resp.text
    msgs = resp.json()

    assert [m["turn_no"] for m in msgs] == [3, 4]
    # User row (turn 3) should not include payload_json
    assert "payload_json" not in msgs[0]
    # Assistant row (turn 4) retains payload_json
    assert msgs[1]["role"] == "assistant" and msgs[1]["payload_json"] == {"key": 4}


def test_whiteboard_state_at_turn(client_with_dummy_convex):
    client, dummy = client_with_dummy_convex

    session_id = uuid4()
    _seed_data(dummy, session_id)

    resp = client.get(
        f"/api/v1/sessions/{session_id}/whiteboard_state_at_turn",
        params={"target_snapshot_index": 3},
        headers={"Authorization": "Bearer faketoken"},
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["target_snapshot_index"] == 3
    # Expect two actions (from snapshots 1 and 3)
    assert data["whiteboard_actions"] == [{"action": "a1"}, {"action": "a3"}] 
