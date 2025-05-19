import pytest
from fastapi.testclient import TestClient
from uuid import uuid4


# --- Dummy Supabase Client ---------------------------------------------- #


class _DummyResp:
    """Mimics Supabase query result object with .data attr."""

    def __init__(self, data=None):
        self._data = data

    @property
    def data(self):
        return self._data


class _DummyTable:
    def __init__(self, name: str, store: dict):
        self._name = name
        self._store = store.setdefault(name, [])

        # Query-building state
        self._pending_insert = None
        self._select_fields = None
        self._filters = []  # list[callable]
        self._order_key = None
        self._order_desc = False
        self._limit = None

    # --------------- Insert chain --------------- #
    def insert(self, record: dict):
        self._pending_insert = record
        return self

    # --------------- Select chain --------------- #
    def select(self, *_cols, **_kwargs):
        # Supabase passes column string, possibly with commas; we ignore kwargs
        if _cols:
            # Join together, then split by comma and trim
            cols_str = _cols[0]
            self._select_fields = [c.strip() for c in cols_str.split(",")]
        return self

    # Filters
    def eq(self, col: str, val):
        self._filters.append(lambda r, c=col, v=val: r.get(c) == v)
        return self

    def lt(self, col: str, val):
        self._filters.append(lambda r, c=col, v=val: r.get(c, 0) < v)
        return self

    def lte(self, col: str, val):
        self._filters.append(lambda r, c=col, v=val: r.get(c, 0) <= v)
        return self

    # Order/limit
    def order(self, key: str, desc: bool = False):
        self._order_key = key
        self._order_desc = desc
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    # --------------- Execute --------------- #
    def execute(self):
        # Handle insert.
        if self._pending_insert is not None:
            self._store.append(self._pending_insert)
            self._pending_insert = None
            return _DummyResp()  # insert returns object with data=None

        # Handle select chain.
        records = [r for r in self._store]

        # Apply filters
        for f in self._filters:
            records = [r for r in records if f(r)]

        # Ordering
        if self._order_key is not None:
            records = sorted(records, key=lambda r: r.get(self._order_key), reverse=self._order_desc)

        # Limit
        if self._limit is not None:
            records = records[: self._limit]

        # Field selection
        if self._select_fields is not None:
            records = [
                {k: v for k, v in r.items() if k in self._select_fields}
                for r in records
            ]

        return _DummyResp(records)


class DummySupabase:
    """Crude in-memory imitation of Supabase client (subset)."""

    def __init__(self):
        self._storage: dict[str, list] = {}

    def table(self, name: str):
        return _DummyTable(name, self._storage)

    # For inspection in assertions
    @property
    def storage(self):
        return self._storage


# ------------------------------------------------------------------------- #


@pytest.fixture
def client_with_dummy_supabase(monkeypatch):
    """Provides FastAPI TestClient with Supabase + auth deps overridden."""

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
    from ai_tutor.dependencies import get_supabase_client
    from ai_tutor.auth import verify_token
    from fastapi import Request

    dummy = DummySupabase()

    # Override Supabase dependency
    app.dependency_overrides[get_supabase_client] = lambda: dummy

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


def _seed_data(dummy: DummySupabase, session_id):
    """Populate dummy DB with deterministic message & snapshot rows."""

    # Seed session_messages (turn 1-5)
    for turn in range(1, 6):
        role = "user" if turn % 2 == 1 else "assistant"
        dummy.table("session_messages").insert(
            {
                "session_id": str(session_id),
                "turn_no": turn,
                "role": role,
                "text": f"m{turn}",
                "payload_json": {"key": turn} if role == "assistant" else None,
                "whiteboard_snapshot_index": None,
            }
        ).execute()

    # Seed whiteboard snapshots at 1 and 3
    for idx in [1, 3]:
        dummy.table("whiteboard_snapshots").insert(
            {
                "session_id": str(session_id),
                "snapshot_index": idx,
                "actions_json": [{"action": f"a{idx}"}],
            }
        ).execute()


# ------------------------------------------------------------------------- #


def test_chat_history_pagination(client_with_dummy_supabase):
    client, dummy = client_with_dummy_supabase

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


def test_whiteboard_state_at_turn(client_with_dummy_supabase):
    client, dummy = client_with_dummy_supabase

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