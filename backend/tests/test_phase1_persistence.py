import asyncio
import pytest
from uuid import uuid4

from ai_tutor.context import TutorContext
from ai_tutor.routers.tutor_ws import _persist_user_message, _persist_assistant_message


class DummyConvex:
    def __init__(self):
        self.storage: dict[str, list] = {
            "session_messages": [],
            "whiteboard_snapshots": [],
        }

    async def mutation(self, name: str, args: dict):
        if name == "insert_session_message":
            self.storage["session_messages"].append(args)
        elif name == "insert_snapshot":
            self.storage["whiteboard_snapshots"].append(args)
        else:
            raise ValueError(name)


@pytest.mark.asyncio
async def test_persist_user_and_assistant_message_order():
    supabase = DummyConvex()
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