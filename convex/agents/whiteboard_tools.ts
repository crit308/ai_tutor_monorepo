import { tool } from "ai";
import { z } from "zod";

// Tool: get_whiteboard_summary
export const getWhiteboardSummaryTool = tool({
  description: "Get a concise summary of the current whiteboard for the given session.",
  parameters: z.object({
    sessionId: z.string().describe("Current session ID"),
  }),
  // No automatic execution needed – server intercepts the JSON call.
  async execute(_args: { sessionId: string }) {
    return "Requested summary";
  },
});

// Strict WB object schema
const wbObjectSchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    x: z.number().optional(),
    y: z.number().optional(),
    rx: z.number().optional(),
    ry: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    points: z.array(z.number()).optional(),
    fill: z.string().optional(),
    stroke: z.string().optional(),
    strokeWidth: z.number().optional(),
    markerEnd: z.string().optional(),
    text: z.string().optional(),
    fontSize: z.number().optional(),
    metadata: z.record(z.any()).optional(),
  })
  .strict();

// Update schema (id + diff)
const wbUpdateSchema = z
  .object({
    id: z.string(),
    diff: wbObjectSchema.partial().strict(),
  })
  .strict();

// Patch schema
const whiteboardPatchSchema = z
  .object({
    creates: z.array(wbObjectSchema).optional(),
    updates: z.array(wbUpdateSchema).optional(),
    deletes: z.array(z.string()).optional(),
  })
  .strict();

export const applyWhiteboardPatchTool = tool({
  description: "Apply a JSON patch of primitives to the whiteboard.",
  parameters: z.object({
    patch: z.object({}).strict().describe("WhiteboardPatch object"),
    lastKnownVersion: z.number(),
  }).strict(),
  async execute(_args) {
    return "Patch enqueued";
  },
});

export const whiteboardTools = {
  get_whiteboard_summary: getWhiteboardSummaryTool,
  apply_whiteboard_patch: applyWhiteboardPatchTool,
}; 