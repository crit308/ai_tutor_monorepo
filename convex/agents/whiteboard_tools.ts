// @ts-nocheck
import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { api } from "../_generated/api";

// Tool: get_whiteboard_summary
export const getWhiteboardSummaryTool = createTool({
  description: "Get a concise summary of the current whiteboard for the given session.",
  args: z.object({
    sessionId: z.string().describe("Current session ID"),
  }),
  async handler(ctx: any, args) {
    const res = await ctx.runAction(api.agents.whiteboard_agent.executeWhiteboardSkill, {
      skill_name: "get_whiteboard_summary",
      skill_args: {},
      session_id: args.sessionId,
      user_id: ctx.userId ?? "ai-tutor",
    });
    return res.payload.message_text;
  },
});

// Strict WB object schema
const wbObjectSchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    x: z.number(),
    y: z.number(),
    rx: z.number(),
    ry: z.number(),
    width: z.number(),
    height: z.number(),
    points: z.array(z.number()),
    fill: z.string(),
    stroke: z.string(),
    strokeWidth: z.number(),
    markerEnd: z.string(),
    text: z.string(),
    fontSize: z.number(),
    metadata: z
      .object({
        groupId: z.string(),
        role: z.string(),
      })
      .strict(),
  })
  .strict();

// Update schema (id + diff)
const wbUpdateSchema = z
  .object({
    id: z.string(),
    diff: wbObjectSchema.strict(),
  })
  .strict();

// Patch schema (for reference; not used directly in code)

export const applyWhiteboardPatchTool = createTool({
  description: "Apply a JSON patch of primitives to the whiteboard.",
  args: z.object({
    sessionId: z.string().describe("Current session ID"),
    patch: z
      .object({
        creates: z.array(wbObjectSchema),
        updates: z.array(wbUpdateSchema),
        deletes: z.array(z.string()),
      })
      .strict()
      .describe("WhiteboardPatch object"),
    lastKnownVersion: z.number(),
  }).strict(),
  async handler(ctx: any, args) {
    const res = await ctx.runAction(api.agents.whiteboard_agent.executeWhiteboardSkill, {
      skill_name: "apply_whiteboard_patch",
      skill_args: { patch: args.patch, lastKnownVersion: args.lastKnownVersion },
      session_id: args.sessionId,
      user_id: ctx.userId ?? "ai-tutor",
    });
    return res.payload.message_text;
  },
});

export const whiteboardTools = {
  get_whiteboard_summary: getWhiteboardSummaryTool,
  apply_whiteboard_patch: applyWhiteboardPatchTool,
}; 