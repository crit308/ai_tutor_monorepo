// @ts-nocheck
// convex/skills/whiteboard_inspection.ts

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

export const inspectWhiteboard = internalAction({
  args: {
    sessionId: v.id("sessions"),
    userId: v.optional(v.string()), // Pass userId for auth context
  },
  returns: v.object({
    screenshotDataUrl: v.union(v.string(), v.null()),
    boardSummary: v.object({
      objectCount: v.number(),
      boardVersion: v.number(),
      canvasDimensions: v.object({
        width: v.number(),
        height: v.number(),
      }),
      warnings: v.array(v.string()),
    }),
    objectList: v.array(v.object({
      id: v.string(),
      kind: v.string(),
      role: v.optional(v.string()),
      text: v.union(v.string(), v.null()),
      bbox: v.object({
        x: v.number(),
        y: v.number(),
        width: v.number(),
        height: v.number(),
      }),
    })),
  }),
  handler: async (ctx: any, { sessionId, userId }: { sessionId: Id<"sessions">; userId?: string }) => {
    console.log(`[inspectWhiteboard] Starting inspection for session: ${sessionId}, userId: ${userId}`);

    try {
      // 1. Get Screenshot and Object Data in Parallel
      const [screenshotResult, objects] = await Promise.all([
        ctx.runAction(api.skills.whiteboard_screenshot.requestWhiteboardScreenshot, {
          session_id: sessionId,
          request_context: "AI Agent whiteboard inspection",
        }),
        ctx.runQuery(internal.database.whiteboard.getWhiteboardObjectsInternal, { 
          sessionId, 
          userId: userId || null 
        }),
      ]);

      const warnings: string[] = [];
      if (!screenshotResult.success) {
        warnings.push(`Screenshot capture failed: ${screenshotResult.error_message || 'Unknown error'}`);
      }

      // 2. Get Board Version from the session document
      const sessionDoc = await ctx.runQuery(internal.database.sessions.getSessionInternal, { 
        sessionId, 
        userId: userId || null 
      });
      const boardVersion: number = sessionDoc?.board_version ?? 0;
      const canvasDimensions = {
          width: sessionDoc?.context_data?.canvasDimensions?.width ?? 1200,
          height: sessionDoc?.context_data?.canvasDimensions?.height ?? 800
      };

      // 3. Process Objects into a clean list
      const objectList = objects.map((obj: any) => ({
        id: obj.id,
        kind: obj.kind,
        role: obj.metadata?.role || undefined,
        text: obj.text || null,
        bbox: {
          x: obj.x || 0,
          y: obj.y || 0,
          width: obj.width || 0,
          height: obj.height || 0,
        },
      }));

      // 4. Assemble the final payload
      return {
        screenshotDataUrl: screenshotResult.image_data || null,
        boardSummary: {
          objectCount: objects.length,
          boardVersion: boardVersion,
          canvasDimensions,
          warnings: warnings,
        },
        objectList: objectList,
      };
    } catch (error) {
      console.error(`[inspectWhiteboard] Error inspecting whiteboard:`, error);
      
      // Return error state with empty data
      return {
        screenshotDataUrl: null,
        boardSummary: {
          objectCount: 0,
          boardVersion: 0,
          canvasDimensions: { width: 1200, height: 800 },
          warnings: [`Inspection failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        },
        objectList: [],
      };
    }
  },
}); 