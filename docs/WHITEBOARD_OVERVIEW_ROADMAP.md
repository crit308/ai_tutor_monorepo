# Whiteboard Sandbox – Consolidated Roadmap

_Last updated: <!-- TODO: auto-date -->_

This document marries the existing widget plan, action-bridge tasks, and sandbox wiring work into one end-to-end roadmap so engineers can follow a single source of truth.

---
## 0  Current State (Aug 2025)

• Modal Sandbox launcher spins up `next dev`, persists `sandbox_id` & `sandbox_url` in `sessions` and copies overlay files at boot.  
• `code_overlays` + overlay-sync action can write/update/delete any file inside the sandbox.  
• `whiteboard_objects` Convex table exists and already stores shapes.  
• Front-end embeds the iframe with `useSandbox`; spinner hides on `{type:'ready'}` message.  
• No live Convex → iframe subscription yet; widgets render as placeholder text.

---
## 1  High-Level Goals

| ID | Goal | MVP Done When … |
|----|------|----------------|
| G-1 | Learner passively sees a live canvas of ink, SVG shapes, React widgets **drawn only by the AI** | Objects render & hot-reload in < 1 s |
| G-2 | AI can inspect board via JSON & mutate via Convex tools | Context builder produces compact snapshot each turn |
| G-3 | Multiple boards (pages) per session | `board_id` paging works |
| G-4 | Widgets hot-reload on overlay edit | `?ver=` cache-bust import; Fast Refresh swaps component |
| G-5 | Replay snapshots (optional MVP+) | Timeline slider scrubs history |

---
## 2  Architecture Snapshot

```
Convex ←→ Modal Sandbox
          ├── /canvas   (ink, svg)
          └── /widgets  (React components)
Parent page ⟶ <iframe sandbox="allow-scripts" …>
```
• WhiteboardCanvas subscribes directly to `whiteboard_objects` (read-only token passed in `init`).  
• Overlay-sync copies `/app/widgets/**` on every mutation & posts `overlays-updated`.  
• WidgetHost lazily imports `/app/widgets/${entry}/client.js?ver=${version}` and renders.

---
## 3  Folder & File Convention

```
/app/widgets/<entry>/client.tsx   # "use client" component (required)
/app/widgets/<entry>/index.ts     # optional server wrapper
/app/widgets/widget-sdk.ts        # helper re-exports
```
Overlay path starts with `app/widgets/` → copied verbatim.

---
## 4  Implementation Phases

| Phase | Scope / Key Tasks | Exit Criteria |
|-------|-------------------|--------------|
| A – Convex feed (½ d) | add `convex` to template; pass token; `useQuery` inside canvas | Canvas logs object count without error |
| B – Renderer (1 d) | Canvas layer (used **only by the AI**, no pointer handlers), SVG mapper, WidgetHost with ErrorBoundary & cache-bust import | Rectangle & demo widget appear live |
| C – AI helper utilities (½ d) | Ensure backend tools (`create_whiteboard_objects`, etc.) cover ink, shapes, widgets; no in-iframe pointer events | AI-generated content appears & persists |
| D – Outbound helpers (½ d) | `window.whiteboard.add/update/delete`; ink batching; optimistic UI | User sketch shows up & persists |
| E – Overlay live reload (½ d) | filter `/app/widgets/**`; send `overlays-updated`; re-import on version bump | Edit TSX → widget updates without iframe reload |
| F – Board paging (½ d) | add `board_id`; Prev/Next buttons; parent sends `changeBoard` | Page 1 & 2 render different objects |
| G – AI glue (1 d) | context builder snapshot; tool schema incl. `board_id`, `version`; bump version on overlay edit | AI can add widget & see it next turn |
| H – Snapshot MVP (1 d, optional) | `whiteboard_snapshots` table; slider; read-only mode | Slider scrubs and returns to live |

Time-estimates assume one focused engineer; parallelise where possible.

---
## 5  Edge-Case & Safety Checklist

1. Every widget file must include `"use client"`.  
2. Dynamic import path must use `encodeURIComponent(entry)`.  
3. Cache-bust querystring `?ver=${version}`; overlay patch must bump `version`.  
4. Cap: `spec` ≤ 100 kB, total objects ≤ 10 k.  
5. Parent iframe keeps `sandbox="allow-scripts"` **without** `allow-same-origin`.  
6. ErrorBoundary posts `{type:'widget-error'}` so tutor can instruct AI to fix.  
7. Launcher clears `sandbox_id` if container is gone; overlay-sync re-spawns.

---
## 6  Ready-For-Dev To-Do (tick as you go)

- [ ] Convex read-only token helper
- [ ] InkLayer rendering (AI-only)
- [ ] SVG mapper (rect, ellipse, arrow, text)
- [ ] WidgetHost + ErrorBoundary + cache-bust
- [ ] overlay-sync `overlays-updated` broadcast
- [ ] `widget-sdk.ts` helper file
- [ ] Tool schema update (`board_id`, `entry`, `props`, `version`)
- [ ] Page picker UI & `changeBoard`
- [ ] Snapshot table & slider (optional)

Once these boxes are green we reach MVP G-1 → G-4. Persistent time-travel (G-5) can follow.

---
## 7  Future Enhancements (post-MVP)

• Branching timelines (fork board state while viewing history).  
• Widget dependency installer (AI adds npm libs).  
• Collaboration: multi-cursor & conflict-free OT on objects.  
• Modal network lock-down (`block_network`) per widget type.  
• Analytics overlay: heat-map of learner clicks inside widgets. 

• InkLayer renders AI-generated strokes; **no pointer listeners for the learner**.

• InkLayer implementation includes pointer listeners; learner drawing disabled — **AI-only** board modifications. 