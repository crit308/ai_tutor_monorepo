# Persistent Interactive Whiteboard Enhancement Plan (v2)

_Last updated: 2025-05-15_

---

## 0. Executive Summary

We will upgrade the AI-Tutor's whiteboard from a "draw-and-forget" surface into a **single, persistent, fully queryable canvas** that the AI can manipulate with the same dexterity as a human teacher.  The work is decomposed into phased deliverables so that every merge to `main` produces a self-contained, demo-ready improvement.

---

## 1. Glossary & Shared Contracts

| Term                        | Definition |
|-----------------------------|------------|
| **CanvasObjectSpec**        | Typed object (Python `pydantic` & TS `zod`) that travels over WebSocket. |
| **WhiteboardAction**        | One of `ADD_OBJECTS`, `UPDATE_OBJECTS`, `DELETE_OBJECTS`, `CLEAR_BOARD`. |
| **Metadata Schema**         | Strict set of keys embedded in every `CanvasObjectSpec.metadata`. See `docs/whiteboard_metadata.md`. |
| **board_summary**           | Compressed JSON that the backend sends to the LLM when it needs situational awareness. |

A junior engineer should memorise these names—they appear in code, tests and prompt templates.

---

## 2. Phase Road-map

> Each phase is designed to be completed in **≤ 1 week** by a single engineer.  Tackle them sequentially.

### Phase 0 – Foundations (Prerequisite)

**Goal:** Establish the artefacts every later phase relies on.

Backend (Python)
1. `agent_t/skills/layout_board_ops.py`
   1. Export a reusable `Metadata` pydantic model.
   2. Harden `update_object_on_board` & `delete_object_on_board` with type and bounds checking.
2. `agent_t/services/whiteboard_metadata.py` _(NEW)_
   ```py
   class Metadata(BaseModel):
       source: Literal["assistant", "user"]
       role: str  # e.g. "interactive_concept"
       semantic_tags: list[str] = []
       bbox: tuple[float, float, float, float]  # x,y,width,height (canvas units)
       group_id: str | None = None
   ```
3. Unit tests in `tests/whiteboard/test_metadata.py`.

Frontend (TypeScript)
1. `frontend_agent/src/types/canvas.ts` _(NEW)_ mirrors `Metadata` via `zod`.
2. Add a `WhiteboardActionType` enum with the four verbs.

Deliverables ✓
* Passing unit tests.
* Storybook story demonstrating round-trip serialisation of `Metadata`.

---

### Phase 1 – Granular Control & Incremental Drawing

**Goal:** The AI stops clearing the board by default and instead performs small‐grained edits.

Backend
1. In `skills/drawing_tools.py` ensure every draw helper stores `metadata.source = "assistant"` and auto-generates **deterministic** IDs (`uuid5(namespace, content_hash)`).
2. Extend `update_object_on_board` to accept **partial** updates (PATCH semantics).
3. Add a `layout_allocator.place_relative(anchor_id, strategy)` helper (top-left, right-of, below).

Frontend
1. `WhiteboardProvider.tsx`
   * Add reducers for `UPDATE_OBJECTS` & `DELETE_OBJECTS`.
   * Ensure Fabric.js objects are **mutated**, not replaced, so history/undo keeps working.
2. Visually flash updated objects (`tw-animate-flash` for 300 ms) so the user notices subtle edits.

Prompt / Orchestrator
1. New memory key `whiteboard_ledger` (dict[id → Metadata]).
2. Before every `draw` tool call the agent must `find_object_on_board` and check if the drawing already exists.
   * Provide an example prompt in `prompts/draw_with_memory.md`.

Acceptance Tests ✓
* Cypress test: AI explains Pythagorean theorem in 3 steps without clearing the canvas.

---

### Phase 2 – AI Vision (Find & Summarise)

**Goal:** The AI can locate and describe what is on the canvas.

Backend
1. `find_object_on_board` signature →
   ```py
   def find_object_on_board(*, meta_query: dict[str, Any] | None = None,
                             spatial_query: tuple[float,float,float,float] | None = None,
                             fields: list[str] | None = None) -> list[CanvasObjectSpec]
   ```
2. Implement a **2D R-tree index** in `services/spatial_index.py` for fast bbox look-ups.
3. Provide `board_summary = compress(objects, strategy="ids+tags+bbox")` utility.

Frontend
* No changes— already supports passive persistence via Yjs.

Tests ✓
* Pytest parametrised cases: meta only, spatial only, combined.

---

### Phase 3 – Interactive Behaviours (User Indirect Interaction)

**Goal:** User clicks or asks about canvas elements → AI reacts intelligently.

Frontend
1. Enhance `Whiteboard.tsx` to emit
   ```ts
   sendInteraction("canvas_click", { objectId, pointer: {x,y} });
   ```
2. Optional: Right-click context menu powered by `@radix-ui/react-context-menu` listing AI-provided options.

Backend
1. WebSocket handler `tutor_ws.py` – route `canvas_click` to agent along with full `Metadata` of the target object.
2. New skill `highlight_object(object_id, style="pulse")` that wraps `update_object_on_board`.

Prompt
* Add examples: "Explain the green box I just clicked."

Tests ✓
* Playwright E2E: Click diagram, chat shows explanation, diagram pulses.

---

### Phase 4 – Observability & Polish

Tasks
1. Emit `whiteboard_action` spans to OpenTelemetry.
2. Sentry performance badge on any action > 100 ms.
3. Lighthouse audit to confirm no FPS drop during rapid updates.

---

## 3. Files & Folders To Touch (Cheat-Sheet)

```
agent_t/skills/layout_board_ops.py      # Extend skills
agent_t/services/spatial_index.py       # NEW R-tree
agent_t/services/whiteboard_metadata.py # NEW shared model
agent_t/prompts/                        # Prompt additions
frontend_agent/src/…                    # Provider, types, context menu
tests/whiteboard/                       # New unit + e2e tests
```

---

## 4. Done-Definition Checklist

- [ ] All new/changed Python functions have docstrings & type hints.
- [ ] TS code passes `pnpm lint`.
- [ ] Unit, integration, and E2E tests green in CI.
- [ ] Changelog entry under `## [Unreleased]`.
- [ ] Demo video recorded and attached to PR description.

---

### 🎉 After Phase 4 the AI-Tutor will behave like a diligent human teacher: keeping the board tidy, referring back to earlier sketches, and responding to student gestures without ever losing context.
