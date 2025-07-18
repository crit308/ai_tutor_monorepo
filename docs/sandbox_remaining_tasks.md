# Whiteboard Sandbox – Remaining Work (Focused)

_Last updated: {{DATE}}_

Below are the two critical streams left to reach a learner-visible, AI-driven whiteboard.

## 1. Whiteboard Action Bridge (**blocker**)

Goal: bidirectional, real-time sync between AI / other clients and the Fabric canvas in the sandbox iframe.

### 1.1  Data model
```ts
// convex/database/whiteboard_objects.ts (proposed)
{
  _id: Id<'whiteboard_objects'>,
  session_id: Id<'sessions'>,
  kind: 'ink' | 'rect' | 'ellipse' | 'arrow' | 'widget',
  spec: any,          // JSON payload – see mapper below
  created_by: string | null, // userId or "ai"
  version: number,    // ++ each time spec changes
  created_at: number,
  updated_at: number,
}
```
*Hard cap*: **spec ≤ 100 kB** – mutation rejects oversize payload to avoid 1 MB Convex limit.

### 1.2  Inbound (Convex → iframe)
1. Parent window supplies a **signed read-only Convex auth token** in the existing `init` postMessage:
```js
{ ns:'ai-tutor/wb', v:1, type:'init', payload:{ sessionId, token } }
```
2. Iframe loads Convex client (`npm i convex`) and calls:
```ts
const objects = useQuery(api.whiteboard_objects.list, {sessionId});
```
3. `objects` array feeds `objectToFabric(obj)` mapper (idempotent update-or-add by `_id`).

### 1.3  objectToFabric mapper (V1)
| kind   | Fabric primitive | Key fields in `spec` |
|--------|------------------|----------------------|
| ink    | `fabric.Path`    | `d` SVG path string, stroke color, width |
| rect   | `fabric.Rect`    | `x,y,width,height,fill,stroke` |
| ellipse| `fabric.Ellipse` | `cx,cy,rx,ry,fill,stroke` |
| arrow  | two `fabric.Line` + triangle head | `x1,y1,x2,y2,color,width` |
| widget | overlay `<div>` mounting React component | `entry:'BarChart.tsx', props:{...}` |

### 1.4  Outbound (iframe → Convex)
* Helpers exposed globally:
```ts
window.whiteboard.addInk(points[]);
window.whiteboard.addShape(kind, spec);
window.whiteboard.updateObject(id, patch);
window.whiteboard.deleteObject(id);
```
* Under the hood they call Convex mutations (`createWhiteboardObject`, `patchWhiteboardObject`, `deleteWhiteboardObject`).
* **Ink batching**: capture pointer-move events locally; on `mouse:up` upload *one* `ink` object.
* Optimistic UI: add/update locally first; rollback on mutation error.

### 1.5  Conflict handling
* Each object carries `version`. Patch mutation rejects if caller's `version` < stored; client then refetches.
* This plus Fabric's built-in locking (set `selectable=false` when another user edits) is enough for MVP.

### 1.6  Undo / redo (MVP)
* Sandbox maintains in-memory stack of `{added:[ids], removed:[ids], before?, after?}` patches.
* `undo()` issues Convex mutations that restore the previous set, ensuring all clients converge.

### 1.7  Open questions
* How to diff widget code updates (ts/tsx) vs. object prop updates.
* Do we embed small widget code inline in `spec` or always rely on overlay files?

---

## 4. Snapshot Playback & Time-Travel

Goal: learners or the AI can scrub the board's history; snapshots double as lightweight audit trail.

### 4.1  Snapshot creation
* Automatic triggers:
  1. **Every 60 s** of wall-clock **or**
  2. After **N = 20** whiteboard mutations **or**
  3. When tutor agent finishes a long explanation turn.
* Manual trigger via UI button "Save snapshot".
* Mutation `createSnapshot(sessionId, objectsJson)` inserts a gzip'd JSON blob into `whiteboard_snapshots`.

### 4.2  Storage considerations
* Typical board ≤ 80 kB gzipped; still well under Convex 1 MB string cap.
* If snapshot > 200 kB: offload to `ctx.storage` and store the blobId instead.

### 4.3  Playback workflow
1. Parent slider changes → `postMessage {type:'jump', index}` to iframe.
2. Iframe fetches snapshot JSON, flushes current canvas, re-hydrates via same `objectToFabric` mapper.
3. While in history mode: `canvas.evented=false`, toolbar disabled, overlay shows banner "Viewing history" with **Return to Live** button.
4. If user attempts to edit in history: auto-switch to latest snapshot (no branching for MVP).

### 4.4  Future enhancements
* Branching: allow forked timelines when editing past snapshots.
* Tiny diff snapshots to reduce storage.
* Generate mini thumbnails for visual scrubber.

---

Once **1** is shipped the sandbox becomes immediately interactive; snapshots (**4**) then ride on the same mapper, giving us time-travel and persistent history. 