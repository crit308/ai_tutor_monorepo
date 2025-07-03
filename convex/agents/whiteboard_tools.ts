// @ts-nocheck
import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { api, internal } from "../_generated/api";

// --- NEW PRIMARY VISION TOOL ---
export const inspectWhiteboardTool = createTool({
  name: "inspect_whiteboard",
  description: "Get a comprehensive overview of the current whiteboard. Returns a visual screenshot and a structured list of all objects, their properties, and text content. Use this as your primary way to 'see' the board before making any changes.",
  args: z.object({
    sessionId: z.string().describe("The ID of the current session."),
  }),
  async handler(ctx: any, args) {
    // Call the new action through internal API, passing userId for auth context
    const inspectionResult = await ctx.runAction(internal.skills.whiteboard_inspection.inspectWhiteboard, {
      sessionId: args.sessionId,
      userId: ctx.userId || null,
    });

    // 1. Build the text part of the response
    const textPart = `WHITEBOARD INSPECTION RESULTS:

📊 BOARD SUMMARY:
- Objects: ${inspectionResult.boardSummary.objectCount}
- Version: ${inspectionResult.boardSummary.boardVersion}
- Canvas: ${inspectionResult.boardSummary.canvasDimensions.width}x${inspectionResult.boardSummary.canvasDimensions.height}
- Warnings: ${inspectionResult.boardSummary.warnings.join(', ') || 'None'}

📋 OBJECT LIST:
${inspectionResult.objectList.map(obj => 
  `• ${obj.kind.toUpperCase()} "${obj.id}" at (${obj.bbox.x}, ${obj.bbox.y}) size ${obj.bbox.width}x${obj.bbox.height}${obj.text ? ` - Text: "${obj.text}"` : ''}${obj.role ? ` - Role: ${obj.role}` : ''}`
).join('\n')}

🔍 VISUAL ANALYSIS: Please examine the screenshot to understand the visual layout, colors, spatial relationships, alignment, and overall design quality that cannot be captured in text alone.`;

    // 2. Construct a multi-part content array
    const content = [
      {
        type: "text",
        text: textPart,
      }
    ];

    // 3. Add the image part if it exists
    if (inspectionResult.screenshotDataUrl) {
      content.push({
        type: "image_url",
        image_url: {
          url: inspectionResult.screenshotDataUrl,
        },
      });
    } else {
        // If no screenshot, add a warning to the text part
        content[0].text += "\n\n⚠️ Screenshot not available. Relying on structured object data only.";
    }

    // 4. Return the structured content array.
    // The agent framework will use this to build a multi-modal message.
    return content;
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
  // --- NEW PRIMARY VISION TOOL ---
  inspect_whiteboard: inspectWhiteboardTool,

  // --- MODIFICATION TOOLS (UNCHANGED) ---
  create_whiteboard_objects: createWhiteboardObjectsTool,
  update_whiteboard_objects: updateWhiteboardObjectsTool,
  delete_whiteboard_objects: deleteWhiteboardObjectsTool,
};