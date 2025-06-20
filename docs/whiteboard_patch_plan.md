# AI Tutor Whiteboard – Primitives-First Patch Workflow

This document tracks the migration from the **action-replay** whiteboard model to a single, semantic **patch** API consumed by both the AI Tutor and the React client.

---

## High-level Goal

Expose one mutation:

```ts
applyWhiteboardPatch({
  sessionId: Id<"sessions">,
  patch: WhiteboardPatch,
  lastKnownVersion?: number,
});
```

`WhiteboardPatch` is the minimal delta to the canonical state:

```ts
type WhiteboardPatch = {
  creates?: WBObject[];
  updates?: { id: string; diff: Partial<WBObject> }[];
  deletes?: string[];
};
```

Convex applies the patch transactionally, bumps `boardVersion` on the session row, and returns:

```ts
{
  success: boolean;
  newBoardVersion: number;
  issues: ValidationIssue[]; // warnings & errors
  summary?: string;          // e.g. "Created 5, updated 2."
}
```

---

## Phases & Tasks

### Phase 1 — Core Contract & Backend (ETA 2 days)

1. **Schema**  
   • `packages/whiteboard-schema/index.ts`: add `WhiteboardPatch`, `ValidationIssue` types.  
   • `convex/database/schema.ts`: add `board_version: v.number()` to `sessions` (default 0).
2. **Validation**  
   • `convex/helpers/validation.ts`: implement `validateWhiteboardPatch(patch, existing)` performing:  
     – structural checks (ids, diff fields)  
     – style / color sanity  
     – simple geometry warnings (e.g. text outside parent rect).
3. **Mutation**  
   • `convex/database/whiteboard.ts`: add `applyWhiteboardPatch`.  
   • Auth → `requireAuth`, session ownership.  
   • Version guard → compare `lastKnownVersion`.  
   • In one transaction: `deletes`, `updates` (db.patch), `creates` (db.insert).  
   • Increment `boardVersion`.  
   • Run validation, include issues in response.
4. **Unit tests**  
   • `tests/services/test_whiteboard_patch.ts` with happy-path, invalid, and stale-version cases.

### Phase 2 — AI Agent Upgrade (ETA 2 days)

1. **See skill**  
   • `convex/skills/whiteboard_query.ts` → `getWhiteboardSummary(sessionId)` (object counts, text list, grouping info).
2. **Prompt update**  
   • `convex/agents/whiteboard_agent.ts`: retire legacy skills, instruct LLM to See → Patch → Inspect cycle.
3. **Find skill**  
   • Extend `findObjectOnBoard` for metadata queries & projections.
4. **Tuning**  
   • Iterate on prompt until tasks converge in ≤ 2 cycles.

### Phase 3 — Front-end Integration (ETA 1 day)

1. **Hook**  
   • `frontend/src/hooks/useWhiteboardState.ts`: real-time `useQuery(getWhiteboardObjects)`, expose `applyPatch`.
2. **Component**  
   • `Whiteboard.tsx`: render from `objects`, no action replay.  
   • On drag-end → call `applyPatch({ updates:[…] })`.
3. **Optimistic UI**  
   • Apply local movement instantly; rely on subscription to reconcile on error.

### Phase 4 — Testing & Cleanup (ETA 1 day)

1. **E2E**: Cypress/Playwright flows: create, correct, user-move.  
2. **Performance**: monitor Convex dashboard for latency & token usage.  
3. **Deprecate** old `add/update/deleteWhiteboardObject` mutations once the front-end is switched.

---

## Deviations from Initial Draft

• **No feature flag** — v2 patch API fully replaces old mutations once Phase 3 ships.  
• **Adapter layer removed** — the front-end switches directly to the new hook.

---

## Status Checklist

- [ ] Phase 1 — Schema & mutation done
- [ ] Phase 2 — Agent upgraded
- [ ] Phase 3 — React hook live
- [ ] Phase 4 — Tests green & legacy code removed

This document should be kept up to date as each task is completed. 