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

// Tool: get_whiteboard_image
export const getWhiteboardImageTool = createTool({
  description: "Get the current whiteboard as a visual image (SVG data URL). This allows you to actually SEE the whiteboard layout visually, just like a human would. Perfect for intuitive visual assessment of the educational explanation's clarity, aesthetics, and effectiveness.",
  args: z.object({
    sessionId: z.string().describe("Current session ID"),
  }),
  async handler(ctx: any, args) {
    const res = await ctx.runAction(api.agents.whiteboard_agent.executeWhiteboardSkill, {
      skill_name: "get_whiteboard_image",
      skill_args: {},
      session_id: args.sessionId,
      user_id: ctx.userId ?? "ai-tutor",
    });
    return res.payload.message_text;
  },
});

// Tool: get_whiteboard_screenshot
export const getWhiteboardScreenshotTool = createTool({
  description: "Take a REAL screenshot of the whiteboard as it appears in the user's browser. This captures the exact visual appearance including colors, fonts, styling, and layout exactly as a human user sees it. The most accurate way to understand the whiteboard visually.",
  args: z.object({
    sessionId: z.string().describe("Current session ID"),
  }),
  async handler(ctx: any, args) {
    const res = await ctx.runAction(api.skills.whiteboard_screenshot.requestWhiteboardScreenshot, {
      session_id: args.sessionId,
      request_context: "AI tutor visual analysis",
    });
    
    if (res.success && res.image_data) {
      // Return in a format that signals to the agent this is an image to analyze
      return `I can see the whiteboard screenshot. The image data is: ${res.image_data}

Please analyze this image and describe what you see on the whiteboard, including:
1. Overall layout and organization
2. Types of content (text, diagrams, drawings, etc.)
3. Colors and visual styling  
4. Educational elements like questions, equations, or concepts
5. Any interactive elements or tools visible
6. Spatial relationships and visual hierarchy

Provide a detailed description of the whiteboard content as if you are looking at it visually.`;
    } else {
      // Return a helpful error message that the AI can work with
      throw new Error(`Screenshot capture failed: ${res.error_message || 'Unknown error'}. The frontend may not be connected or screenshot functionality is unavailable.`);
    }
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
  get_whiteboard_image: getWhiteboardImageTool,
  get_whiteboard_screenshot: getWhiteboardScreenshotTool,
  create_whiteboard_objects: createWhiteboardObjectsTool,
  update_whiteboard_objects: updateWhiteboardObjectsTool,
  delete_whiteboard_objects: deleteWhiteboardObjectsTool,
}; 