// @ts-nocheck
import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// --- NEW PRIMARY VISION TOOL ---
// 
// IMPORTANT: This tool follows OpenAI Vision API best practices:
// 1. Tool returns ONLY the file ID string (no image analysis)
// 2. Agent must embed the file ID in next assistant message using image_url content type
// 3. Vision model analyzes image AFTER it's embedded in the message
// 4. No analysis happens inside this tool - it's purely for file ID retrieval
//
export const inspectWhiteboardTool = createTool({
  name: "inspect_whiteboard",
  description: "Returns ONLY the screenshot file ID string for the current whiteboard. After receiving this file ID, the assistant must send a follow-up message that embeds the image using the image_url content type so the Vision model can analyze it.",
  args: z.object({
    sessionId: z.string().describe("The ID of the current session."),
  }),
  async handler(ctx: any, args) {
    // Fetch screenshot via existing inspection action (reuse implementation)
    const inspectionResult = await ctx.runAction(internal.skills.whiteboard_inspection.inspectWhiteboard, {
      sessionId: args.sessionId as Id<"sessions">,
      userId: ctx.userId || null,
    });

    // Return ONLY the file_id string - no analysis, no structured data
    // The Vision model will analyze the image after it's embedded in the assistant message
    const fileId = inspectionResult.screenshotFileId;
    
    // Fallback: empty string if screenshot missing
    if (!fileId) {
      return "";
    }

    return fileId;
  },
});

// --- DATA-ONLY WHITEBOARD INSPECTION TOOL ---
// 
// Use this tool when you need structured data about whiteboard objects.
// If you also need to SEE the whiteboard, use inspect_whiteboard instead.
//
export const getWhiteboardDataTool = createTool({
  name: "get_whiteboard_data",
  description: "Return structured JSON data with screenshotFileId, boardSummary, and objectList for the current whiteboard. Use this when you need object data without visual analysis. For visual analysis, use inspect_whiteboard instead.",
  args: z.object({
    sessionId: z.string(),
  }),
  async handler(ctx: any, args) {
    const inspectionResult = await ctx.runAction(internal.skills.whiteboard_inspection.inspectWhiteboard, {
      sessionId: args.sessionId as Id<"sessions">,
      userId: ctx.userId || null,
    });

    return {
      screenshotFileId: inspectionResult.screenshotFileId,
      boardSummary: inspectionResult.boardSummary,
      objectList: inspectionResult.objectList,
    };
  },
});

// --- Minimal WB object schema to satisfy OpenAI strict mode ---
const pct = () => z.number().min(0).max(1);

// --- Whiteboard object schema (all properties required but nullable for optional values) ---
const wbObjectSchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    xPct: pct(),
    yPct: pct(),
    widthPct: pct().nullable(),
    heightPct: pct().nullable(),
    rxPct: pct().nullable(),
    ryPct: pct().nullable(),
    fill: z.string().nullable(),
    stroke: z.string().nullable(),
    strokeWidth: z.number().nullable(),
    text: z.string().nullable(),
    fontSize: z.number().nullable(),
  })
  .strict();

// Update schema (id + diff)
const wbUpdateSchema = z.object({
  id: z.string(),
  diff: wbObjectSchema,
});

// --- SHOW WHITEBOARD IMAGE (DEPRECATED) TOOL ---
// 
// DEPRECATED: This tool is no longer needed with correct OpenAI Vision API usage.
// Use inspect_whiteboard instead, which returns the URL directly.
// The agent should embed the URL in the next assistant message automatically.
//
export const showWhiteboardImageTool = createTool({
  name: "show_whiteboard_image",
  description:
    "DEPRECATED: This tool is no longer needed. Use inspect_whiteboard instead, which returns the URL directly for embedding in assistant messages.",
  args: z.object({
    url: z.string().describe("The HTTPS URL of the whiteboard screenshot to embed."),
  }),
  async handler(_ctx, args) {
    // Simply echo back the URL so the calling framework has access if needed.
    return { url: args.url };
  },
});

// ---------------- TOOL DEFINITIONS ----------------
// Tool: create_whiteboard_objects
export const createWhiteboardObjectsTool = createTool({
  name: "create_whiteboard_objects",
  description: "Create new objects on the whiteboard. All styling fields must be supplied (null if unused) to satisfy strict validation.",
  args: z.object({
    sessionId: z.string(),
    objects: z.array(wbObjectSchema),
    lastKnownVersion: z.number(),
  }),
  async handler(ctx: any, args) {
    const patch = { creates: args.objects, updates: [], deletes: [] };
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
  name: "update_whiteboard_objects",
  description: "Update existing objects on the whiteboard using percentage-based coordinates.",
  args: z.object({
    sessionId: z.string(),
    updates: z.array(wbUpdateSchema),
    lastKnownVersion: z.number(),
  }),
  async handler(ctx: any, args) {
    const patch = { creates: [], updates: args.updates, deletes: [] };
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
  name: "delete_whiteboard_objects",
  description: "Delete objects from the whiteboard.",
  args: z.object({
    sessionId: z.string(),
    objectIds: z.array(z.string()),
    lastKnownVersion: z.number(),
  }),
  async handler(ctx: any, args) {
    const patch = { creates: [], updates: [], deletes: args.objectIds };
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
  // --- PRIMARY VISION TOOL (OpenAI Vision API compliant) ---
  inspect_whiteboard: inspectWhiteboardTool,
  // --- DATA-ONLY TOOL (for structured data without visual analysis) ---
  get_whiteboard_data: getWhiteboardDataTool,
  // --- MODIFICATION TOOLS (UNCHANGED) ---
  create_whiteboard_objects: createWhiteboardObjectsTool,
  update_whiteboard_objects: updateWhiteboardObjectsTool,
  delete_whiteboard_objects: deleteWhiteboardObjectsTool,
  // --- DEPRECATED TOOL (no longer needed) ---
  show_whiteboard_image: showWhiteboardImageTool,
};