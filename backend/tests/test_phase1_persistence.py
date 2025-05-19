import asyncio
import pytest
from uuid import uuid4

from ai_tutor.context import TutorContext
from ai_tutor.routers.tutor_ws import _persist_user_message, _persist_assistant_message


class _DummyResp:
    def execute(self):
        return self

    @property
    def data(self):
        return None


class _DummyTable:
    def __init__(self, name: str, store: dict):
        self._name = name
        self._store = store.setdefault(name, [])
        self._pending = None

    # Mimic Supabase ``insert`` chaining API
    def insert(self, record: dict):
        self._pending = record
        return self

    # For select/order/limit in hydrate we ignore; only used in persist tests
    def select(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def lte(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self._pending is not None:
            self._store.append(self._pending)
            self._pending = None
        # return minimal supabase-python like dict
        return _DummyResp()


class DummySupabase:
    def __init__(self):
        self._storage: dict[str, list] = {}

    def table(self, name: str):
        return _DummyTable(name, self._storage)

    # expose storage for assertions
    @property
    def storage(self):
        return self._storage


@pytest.mark.asyncio
async def test_persist_user_and_assistant_message_order():
    supabase = DummySupabase()
    ctx = TutorContext(session_id=uuid4(), user_id=uuid4())

    # Persist two user messages
    await _persist_user_message(supabase, ctx, "hello")
    await _persist_user_message(supabase, ctx, "world")

    assert ctx.latest_turn_no == 2
    user_rows = supabase.storage["session_messages"]
    assert len(user_rows) == 2
    assert [r["turn_no"] for r in user_rows] == [1, 2]
    assert all(r["role"] == "user" for r in user_rows)

    # Persist assistant with whiteboard snapshot
    wb_actions = [{"type": "ADD_OBJECTS", "objects": []}]
    await _persist_assistant_message(
        supabase,
        ctx,
        text_summary="answer",
        payload={"foo": "bar"},
        whiteboard_actions=wb_actions,
    )
    assert ctx.latest_turn_no == 3
    assert ctx.latest_snapshot_index == 3

    rows = supabase.storage["session_messages"]
    assert len(rows) == 3
    last = rows[-1]
    assert last["role"] == "assistant"
    assert last["whiteboard_snapshot_index"] == 3
    # Snapshot stored
    assert len(supabase.storage["whiteboard_snapshots"]) == 1
    snap = supabase.storage["whiteboard_snapshots"][0]
    assert snap["snapshot_index"] == 3


def test_lean_dict_removes_histories():
    ctx = TutorContext(session_id=uuid4(), user_id=uuid4())
    ctx.history.append({"role": "user", "content": "hi"})
    ctx.whiteboard_history.append([{"foo": "bar"}])

    slim = ctx.lean_dict()
    assert "history" not in slim
    assert "whiteboard_history" not in slim 