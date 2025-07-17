# Whiteboard Sandbox Persistence Plan

## Implementation Progress (July 2025)

| Area | Status | Notes |
|------|--------|-------|
| Convex schema (`code_overlays`, session sandbox fields) | **✓ Done** | Deployed in production, migrations applied |
| Modal sandbox launcher (`convex/actions/sandbox.ts`) | **✓ Done** | Builds template, polls health, returns tunnel URL |
| Front-end hook & iframe (`useSandbox`, `SandboxWhiteboard`) | **✓ Done** | Health-polling + error handling implemented |
| Base template repo<br/>• root route (`/`) placeholder<br/>• `/api/health` endpoint<br/>• `postMessage('ready')` | **✓ Done** | Verified in running sandbox |
| Real-time file bridge (Convex ↔ sandbox FS) | **✗ Todo** | Needs WS/SSE listener inside template + overlay file mutations |
| Whiteboard UI inside sandbox | **✗ Todo** | Current placeholder only; needs Fabric canvas & widget support |
| Guard-rails (lint / tsc / allow-list) | **✗ Todo** | Not started |
| Undo/Redo, snapshots, new postMessage commands | **✗ Todo** | Legacy system only |
| CSP, quotas, security polish | **✗ Todo** | Pending |

> Legend: **✓ Done**     **✗ Todo / Not started**

The remainder of this document (goals, architecture, roadmap) is kept unchanged for reference.

## 1. Goals & Requirements

• Allow the AI to run custom, untrusted Next.js code inside **Modal Sandbox** for each learning session (EU region selectable).  
• Persist every user-specific change so the project re-hydrates instantly in future sessions, just like Replit workspaces.  
• Keep Convex as the single source of truth and leverage its real-time streaming to all clients and background processes.  
• Minimise storage and bandwidth by storing only the **overlay** (files that differ from the base template), not the whole Next.js repo.  
• Preserve the existing whiteboard features: undo/redo, time-travel replay, multi-user collaboration.  
• Enforce clear security and resource limits around sandbox execution.

## 2. High-Level Architecture

1. **Base template** (public Git repo) – a minimal Next.js app with required dependencies and folders.  
2. **Convex tables** – one document per overlay file (text) and one Storage blob per large/binary asset.  
3. **Launcher function** – clones the template into a new sandbox, copies overlay files from Convex into the sandbox, installs deps, then starts `next dev`.  
4. **Live bridge** – a WebSocket channel pushes file updates from the tutor agent or other clients straight into both Convex and the running sandbox so hot-reload is instantaneous.

## 3. Data Model in Convex (text description)

Table `code_overlays`  
• id (Convex Id)  
• project_id (session or widget identifier)  
• path (string, e.g. "app/page.tsx")  
• content (string, null if deleted)  
• blob_id (storage id for large assets)  
• sha (hash for diffing & caching)  
• created_at, updated_at  
Index by `project_id` + `path`.

Convex Storage is used for assets over ≈1 MB.

## 4. Sandbox Lifecycle

1. On session start, query all overlay docs for the project.  
2. Create a sandbox with the base repo.  
3. Materialise overlay files inside the sandbox (write or delete).  
4. If `package.json` changed, run `npm install`.  
5. Launch `next dev`, expose the port, pipe logs back to the UI.  
6. Store the template commit SHA alongside the session to guarantee reproducibility.

## 5. Editing Workflow

• AI (or user) issues file-level commands: create, update, delete, rename.  
• Orchestrator validates, writes to Convex, then applies the same change inside the running sandbox.  
• Convex's real-time feed updates all other clients; state stays consistent.  
• Undo/redo is tracked per file by storing previous `sha` and content in the action history.

## 6. Security & Resource Limits

• Execution isolation: iframe sandbox in the browser + Modal Sandbox in the cloud (gVisor-isolated).  
• Per-sandbox quotas: CPU, memory, run-time (max 45 min), outbound bandwidth.  
• Storage quotas: overlay size and file count limits enforced before write.  
• Linting / static analysis hooks can run on each save for additional defence (optional).  
• Logs routed to Observability tab for inspection and early anomaly detection.

## 7. Migration & Backward-Compatibility

• Existing Fabric-based whiteboard objects remain unchanged.  
• A new "widget" element kind wraps the sandbox URL or preview frame.  
• Historical sessions without widgets load exactly as today; mixed sessions interoperate.

## 8. Open Questions / Next Steps

1. Finalise the overlay size limits and enforcement strategy.  
2. Decide whether to expose full logs to learners or keep them internal.  
3. Design the postMessage API between parent window and sandbox iframe (events, telemetry).  
4. Implement a thin LLM prompt helper that summaries relevant overlay files before edits to keep context size small.  
5. Write automated tests that spin up a sandbox, apply several file edits, and verify hot-reload plus persistence after restart.

## 9. Rendering & Runtime Location – *Everything inside the Sandbox*

After weighing complexity vs. flexibility, we decided the entire whiteboard UI (canvas, SVG, widgets, tool-bars) will live **inside the session-specific Next.js sandbox**.

Parent application responsibilities:
• Render chat panel and a single `<iframe>` that fills the whiteboard area.  
• Establish a postMessage bridge for high-level events (e.g. `answer_submitted`, `snapshot_request`).  
• Start/stop the Modal sandbox (`Sandbox.create`) and pass its tunnel URL (`sb.tunnels()[PORT].url`) to the iframe `src`.

Sandbox application responsibilities:
• Implement the whiteboard React app (Canvas for ink, SVG for shapes, component library for widgets).  
• Persist user edits by calling Convex APIs directly (still file-by-file overlays).  
• Expose a small JS SDK inside `window.parent` for telemetry and commands.  
• Run `next dev` inside the Modal container and forward port **3000** via `encrypted_ports` so the iframe can connect.

Resulting developer / AI contract simplifies to one surface:
```ts
// All commands are handled by code running inside the sandbox
whiteboard.drawInk(points[])
whiteboard.addShape({...})         // shapes rendered with SVG
whiteboard.addWidget({...})        // widgets are just React comps in same app
whiteboard.undo()
whiteboard.redo()
```

Benefits
• Removes split-renderer complexity—AI writes everything as React/TypeScript inside one repo.  
• Natural hot-reload for every change, regardless of element type.  
• Only one security boundary (iframe sandbox) to reason about.  
• Sandbox region (`region:"eu-west-1"` etc.) can be chosen to satisfy data-residency.  
• We can later optimise costs by delaying sandbox spin-up until the first `addWidget` if desired.

## 10. AI Orchestration & Code-Generation Architecture

Chosen pattern: *Generate → Validate → Commit → Broadcast*.  The LLM never writes directly to the database; every change passes through deterministic code.

Pipeline
1. **Conversation Orchestrator** – interprets each learner/AI turn and emits a structured *Task* (`add_widget`, `draw_shape`, `edit_file`, …).
2. **Context Builder** – fetches only the relevant whiteboard elements & overlay files (via vector search + recency) and constructs the prompt for the Code-Writer agent.
3. **Code-Writer Agent** – creates a *Change Set* JSON patch (whiteboard commands & file edits) plus narrative chat response.
4. **Guardrail / Validator** – schema check → path whitelist → eslint / tsc → dependency allow-list.  Rejects or asks LLM to refine on failure.
5. **Committer** – applies the vetted Change Set:
   • Whiteboard commands → Convex `whiteboard_elements`.
   • File edits → Convex `code_overlays`.
   Each commit also records an undo snapshot.
6. **Realtime Broadcaster** – Convex subscriptions update front-end and trigger sandbox `writeFile` calls so Next.js hot-reloads instantly.
7. **Execution Monitor** – listens to sandbox stdout/stderr; on runtime error, notifies chat and (optionally) auto-rolls back.
8. **Memory Store** – embeddings of prior overlay files & key whiteboard elements assist future Context Builder queries.

Streaming UX
• Narration tokens stream immediately.  Change Set is buffered, validated, then committed as an atomic update—visual changes appear near the end of the response for a "live coding" feel without intermediate breakage.

Benefits
• Deterministic safety gates protect against bad or malicious code.
• Clear separation of generation, validation, and side-effects makes the system testable and auditable.
• Hot-reload keeps feedback loop < 1 s, maintaining high engagement.

## 11. Template-Repo Lifecycle (MVP)

• **Per-session version pin** – when a sandbox is first created we store `templateCommitSha` in the `sessions` table and clone that exact commit.  
• **Upgrade path** – if we release a breaking template, we cut a new tagged commit and only *new* sessions see it. Existing sessions stay on their original commit until manually migrated.  
• **Migration (manual for MVP)** – an admin tool can recreate a session with the new template and copy overlay files; no automated merge logic yet.  
• **Runtime package extraction (later)** – move whiteboard runtime into an npm package so most future updates are simple version bumps.

## 12. postMessage Contract (Parent ⇄ Sandbox Iframe)

Envelope (versioned + namespaced):
```ts
interface WBMessage {
  ns: "ai-tutor/wb";   // namespace guard
  v: 1;                 // protocol version (MVP = 1)
  type: string;         // message kind
  payload?: unknown;    // data
  reqId?: string;       // optional for request/response
}
```

MVP message types
• Iframe → Parent
  – `ready` {width, height} – handshake after mount.  
  – `resize` {width, height}.  
  – `answer` {widgetId, data}.  
  – `error`  {widgetId?, message}.  
• Parent → Iframe
  – `init` {sessionId, userId}.  
  – `command` {action:"undo"|"redo"|"setZoom", args}.  
  – `shutdown` (prep for sandbox stop).

Security & reliability
• Parent checks `event.origin === sandboxOrigin` and `msg.ns`.  
• Iframe knows parent origin via first `init`.  
• Heartbeat optional for MVP; we rely on iframe `unload` to detect sandbox loss.

These additions keep the MVP small while ensuring upgrades and cross-window messaging remain safe and predictable.

## 13. Implementation Roadmap

This section sets expectations for **where we are going** (fully-featured sandbox-based whiteboard) and **how we will get there** in incremental, testable phases.  Each phase should land a user-visible improvement while keeping the system deployable.

### Target End-State (MVP)
1. Learner sees chat + sandbox-powered whiteboard in the same page.  
2. AI can draw shapes, ink, and create React widgets; all render live inside the sandbox.  
3. All code written by the AI is persisted file-by-file in Convex and re-hydrates on reload.  
4. Basic security gates (schema validation, eslint/tsc, origin checks) block bad code.  
5. Undo/redo works for both whiteboard edits and file edits.  
6. Sandbox spin-up latency is masked by pre-loading and a graceful loading UI.

### Phase-by-Phase Plan (tactical)

| Phase | Goal | Key Tasks | Exit Criteria |
|-------|------|-----------|---------------|
| 0. Schema & Tables | Prepare Convex for new data | • Create `code_overlays` table + CRUD mutations  
• Add `templateCommitSha` to `sessions` table | Mutations tested via unit tests; no front-end yet |
| 1. Launch Skeleton Sandbox | Bring up a blank Next.js board | • Fork template repo  
• Sandbox launcher (`Sandbox.create`) clones by commit, forwards port 3000, returns tunnel URL  
• Parent page embeds iframe with spinner | URL loads "Hello Whiteboard" inside iframe |
| 2. Real-time Shapes | First end-to-end drawing flow | • Implement Convex client inside sandbox  
• Render `whiteboard_elements` SVG  
• Parent toolbar (or API call) adds rectangle | Rectangle shows up live in sandbox |
| 3. File Overlay Sync | Hot-reload a widget | • Implement `createFile` mutation  
• Sandbox subscribes to overlay files and writes to local FS + triggers HMR | Text widget appears/updates without full refresh |
| 4. Guardrails | Protect against bad code | • Add eslint + tsc checks in Guardrail step  
• Path whitelist enforcement | Invalid code is rejected; useful error surfaced |
| 5. Ink & Basic Tools | Parity with old board | • Canvas ink layer  
• Undo/redo stack  
• Zoom/pan | User can draw freehand and undo |
| 6. Security Polish | Ship-ready hardening | • CSP headers on iframe  
• Storage, CPU quotas & `block_network` / `cidr_allowlist` set in Sandbox  
• origin/ns checks in postMessage | OWASP basic scan passes |

After Phase 6 the MVP criteria above are satisfied and we can start onboarding pilot users while iterating on enhancements (collaboration, LTS template migrations, etc.).

---

This document describes the text-only roadmap; no code has been added yet. 