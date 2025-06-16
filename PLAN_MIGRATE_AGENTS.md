# Migration Plan: Updating Agents to OpenAI Agents SDK with Tracing

This document captures the steps we followed to unblock the **Document-Analyzer** flow and outlines how to replicate the pattern for the remaining agents.

---

## 1. Problem Recap

* Legacy Python backend used the **OpenAI Agents SDK** (Responses API) → full traces/tool-calls in Dashboard.
* TypeScript/Convex port fell back to:
  * Low-level `openai` REST calls **or**
  * Chat-Completions API.
* Result → no tracing, hosted tools ( `file_search` ) not invoked.

---

## 2. Key Fixes Implemented

| Area | Change |
|------|--------|
| Responses vs. Chat API | Globally forced **Responses API** by calling <br>`setOpenAIAPI("responses")` in `base.ts` (executed once per backend). |
| AnalyzerAgent implementation | 1. Removed manual Assistant/Thread code. <br>2. Constructed an `OAAgent` with `fileSearchTool(...)`. <br>3. Called `runAgent(...)` to execute the analysis. |
| Knowledge-base action | Re-used same pattern in `openAIVectorStore.ts` for the post-upload KB analysis. |
| CustomEvent crash | Added minimal runtime poly-fill + loose ambient typings so Agents SDK can emit events on Node 18. |
| Trace delivery | After a long Convex action traces might not flush – added `await getGlobalTraceProvider().forceFlush();` before returning. |

File diff examples:
```ts
// ensure Responses API
import { setOpenAIAPI } from "@openai/agents-openai";
setOpenAIAPI("responses");

// use hosted tool
import { fileSearchTool } from "@openai/agents-openai";

const agent = new OAAgent({
  ...,
  tools: [fileSearchTool(vectorStoreId)],
});

const { finalOutput } = await runAgent(agent, prompt);
```

---

## 3. Checklist to Migrate Remaining Agents

1. **Identify REST / Chat-Completions logic**  
   Replace with `OAAgent` + `runAgent` loop.
2. **Hosted Tool Needs**  
   • `webSearchTool`, `codeInterpreterTool`, etc. available under `@openai/agents-openai`.  
   • Use helper, NOT manual `tool_resources`.
3. **Model Selection**  
   Must be a Responses-capable model (`gpt-4o`, `gpt-4o-mini`, …).
4. **Tracing / Flushing**  
   For long Convex actions add `getGlobalTraceProvider().forceFlush()` before exit.
5. **Poly-fill once**  
   `CustomEvent` poly-fill already lives in `openAIVectorStore.ts`. If other entrypoints run outside that module, ensure poly-fill is imported early.
6. **TypeScript**  
   Use loose `// @ts-ignore` **only** when SDK typings lag (e.g., `file_search`).
7. **Config / Globals**  
   `setOpenAIAPI("responses")` call in `base.ts` is sufficient; no need to duplicate.

---

## 4. Next Steps

* **TeacherAgent, PlannerAgent, SessionAnalyzerAgent** – switch to Agents SDK + hosted tools (none? or reuse KB).  
* **Realtime voice agents** – can stay on `@convex-dev/agent` (already Responses-based).
* **Cron / background tasks** – ensure they also call `forceFlush()`.
* Remove deprecated code after full migration.

---

**Maintainer**: update this doc as additional agents are migrated. 