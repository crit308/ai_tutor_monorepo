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

// Tool: get_enhanced_whiteboard_summary
export const getEnhancedWhiteboardSummaryTool = createTool({
  description: "Get a detailed spatial and semantic analysis of the current whiteboard layout, including object relationships, concept groupings, and layout assessment. This provides much richer context than the basic summary.",
  args: z.object({
    sessionId: z.string().describe("Current session ID"),
  }),
  async handler(ctx: any, args) {
    const res = await ctx.runAction(api.agents.whiteboard_agent.executeWhiteboardSkill, {
      skill_name: "get_enhanced_whiteboard_summary",
      skill_args: {},
      session_id: args.sessionId,
      user_id: ctx.userId ?? "ai-tutor",
    });
    return res.payload.message_text;
  },
});

// Tool: get_whiteboard_svg
export const getWhiteboardSVGTool = createTool({
  description: "Get the current whiteboard exported as SVG text. This provides the most detailed view of the whiteboard layout including exact coordinates, visual styling, groupings, and metadata. Perfect for understanding the complete visual structure and making precise layout suggestions.",
  args: z.object({
    sessionId: z.string().describe("Current session ID"),
  }),
  async handler(ctx: any, args) {
    const res = await ctx.runAction(api.agents.whiteboard_agent.executeWhiteboardSkill, {
      skill_name: "get_whiteboard_svg",
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
    // Use the same full schema for diff to satisfy OpenAI requirements
    diff: wbObjectSchema.strict(),
  })
  .strict();



// Tool: create_whiteboard_objects
export const createWhiteboardObjectsTool = createTool({
  description: "Create new objects on the whiteboard.",
  args: z.object({
    sessionId: z.string().describe("Current session ID"),
    objects: z.array(wbObjectSchema).describe("Array of objects to create"),
    lastKnownVersion: z.number().describe("Last known board version"),
  }).strict(),
  async handler(ctx: any, args) {
    const patch = {
      creates: args.objects,
      updates: [],
      deletes: [],
    };
    const res = await ctx.runAction(api.agents.whiteboard_agent.executeWhiteboardSkill, {
      skill_name: "apply_whiteboard_patch",
      skill_args: { patch, lastKnownVersion: args.lastKnownVersion },
      session_id: args.sessionId,
      user_id: ctx.userId ?? "ai-tutor",
    });
    return res.payload.message_text;
  },
});

// Tool: update_whiteboard_objects
export const updateWhiteboardObjectsTool = createTool({
  description: "Update existing objects on the whiteboard.",
  args: z.object({
    sessionId: z.string().describe("Current session ID"),
    updates: z.array(wbUpdateSchema).describe("Array of object updates"),
    lastKnownVersion: z.number().describe("Last known board version"),
  }).strict(),
  async handler(ctx: any, args) {
    const patch = {
      creates: [],
      updates: args.updates,
      deletes: [],
    };
    const res = await ctx.runAction(api.agents.whiteboard_agent.executeWhiteboardSkill, {
      skill_name: "apply_whiteboard_patch",
      skill_args: { patch, lastKnownVersion: args.lastKnownVersion },
      session_id: args.sessionId,
      user_id: ctx.userId ?? "ai-tutor",
    });
    return res.payload.message_text;
  },
});

// Tool: delete_whiteboard_objects
export const deleteWhiteboardObjectsTool = createTool({
  description: "Delete objects from the whiteboard.",
  args: z.object({
    sessionId: z.string().describe("Current session ID"),
    objectIds: z.array(z.string()).describe("Array of object IDs to delete"),
    lastKnownVersion: z.number().describe("Last known board version"),
  }).strict(),
  async handler(ctx: any, args) {
    const patch = {
      creates: [],
      updates: [],
      deletes: args.objectIds,
    };
    const res = await ctx.runAction(api.agents.whiteboard_agent.executeWhiteboardSkill, {
      skill_name: "apply_whiteboard_patch",
      skill_args: { patch, lastKnownVersion: args.lastKnownVersion },
      session_id: args.sessionId,
      user_id: ctx.userId ?? "ai-tutor",
    });
    return res.payload.message_text;
  },
});

export const whiteboardTools = {
  get_whiteboard_summary: getWhiteboardSummaryTool,
  get_enhanced_whiteboard_summary: getEnhancedWhiteboardSummaryTool,
  get_whiteboard_svg: getWhiteboardSVGTool,
  create_whiteboard_objects: createWhiteboardObjectsTool,
  update_whiteboard_objects: updateWhiteboardObjectsTool,
  delete_whiteboard_objects: deleteWhiteboardObjectsTool,
}; 