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
    screenshotFileId: v.union(v.string(), v.null()),
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
      // Get object data first to check if we need to wait for frontend sync
      const objects = await ctx.runQuery(internal.database.whiteboard.getWhiteboardObjectsInternal, { 
        sessionId, 
        userId: userId || null 
      });
      
      // If we have objects, add a small delay to ensure frontend has time to render them
      // This prevents race condition where screenshot is taken before frontend updates
      if (objects.length > 0) {
        console.log(`[inspectWhiteboard] Found ${objects.length} objects, waiting 2 seconds for frontend sync...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // 1. Get Screenshot and session data in parallel (after potential delay)
      const [screenshotResult, sessionDoc] = await Promise.all([
        ctx.runAction(api.skills.whiteboard_screenshot.requestWhiteboardScreenshot, {
          session_id: sessionId,
          request_context: "AI Agent whiteboard inspection",
        }),
        ctx.runQuery(internal.database.sessions.getSessionInternal, { 
          sessionId, 
          userId: userId || null 
        }),
      ]);

      const warnings: string[] = [];
      if (!screenshotResult.success) {
        warnings.push(`Screenshot capture failed: ${screenshotResult.error_message || 'Unknown error'}`);
      }

      // 2. Get Board Version from the session document
      const boardVersion: number = sessionDoc?.board_version ?? 0;
      const canvasDimensions = {
          width: sessionDoc?.context_data?.canvasDimensions?.width ?? 1200,
          height: sessionDoc?.context_data?.canvasDimensions?.height ?? 800
      };

      // 3. Process Objects into a clean list with accurate bounding boxes
      const objectList = objects
        .filter((obj: any) => {
          // Filter out non-primitive objects that shouldn't be in the OBJECT LIST
          
          // Exclude objects without proper IDs or kinds
          if (!obj.id || !obj.kind) {
            return false;
          }
          
          // Exclude background or non-interactive elements
          if (obj.metadata?.isBackground || obj.metadata?.nonInteractive) {
            return false;
          }
          
          // Only include standard whiteboard object types
          const validKinds = ['rect', 'ellipse', 'text', 'line', 'path', 'arrow'];
          if (!validKinds.includes(obj.kind)) {
            return false;
          }
          
          return true;
        })
        .map((obj: any) => {
        let bbox = { x: 0, y: 0, width: 0, height: 0 };
        
        // Prefer absolute pixel coordinates if present; fall back to percentage-based ones
        const pctToPx = (pct: number | null | undefined, axis: 'x' | 'y') => {
          if (pct === null || pct === undefined) return 0;
          return (axis === 'x' ? canvasDimensions.width : canvasDimensions.height) * pct;
        };
        
        const hasPctPos = obj.xPct !== undefined || obj.yPct !== undefined;
        const hasPctSize =
          obj.widthPct !== undefined ||
          obj.heightPct !== undefined ||
          obj.rxPct !== undefined ||
          obj.ryPct !== undefined;

        // Calculate bbox differently depending on the data available
        if (hasPctPos || hasPctSize) {
          // Percentage-based position
          const x = pctToPx(obj.xPct, 'x');
          const y = pctToPx(obj.yPct, 'y');

          let width = 0;
          let height = 0;

          // Size: first prefer widthPct/heightPct, else derive from rxPct/ryPct (diameter)
          if (obj.widthPct !== undefined && obj.widthPct !== null) {
            width = pctToPx(obj.widthPct, 'x');
          } else if (obj.rxPct !== undefined && obj.rxPct !== null) {
            width = pctToPx(obj.rxPct * 2, 'x');
          }

          if (obj.heightPct !== undefined && obj.heightPct !== null) {
            height = pctToPx(obj.heightPct, 'y');
          } else if (obj.ryPct !== undefined && obj.ryPct !== null) {
            height = pctToPx(obj.ryPct * 2, 'y');
          }

          // For text objects without explicit width/height, estimate
          if (obj.kind === 'text' && (width === 0 || height === 0)) {
            const text = obj.text || '';
            const fontSize = obj.fontSize || 16;
            width = text.length * fontSize * 0.6;
            height = fontSize * 1.2;
          }

          bbox = {
            x,
            y,
            width: Math.max(width, 1),
            height: Math.max(height, 1),
          };
        } else if (obj.kind === 'text') {
          // Existing text estimation fallback
          const text = obj.text || '';
          const fontSize = obj.fontSize || 16;
          const estimatedWidth = text.length * fontSize * 0.6; // rough approximation
          const estimatedHeight = fontSize * 1.2; // approximate line height
          bbox = {
            x: obj.x || 0,
            y: obj.y || 0,
            width: Math.max(estimatedWidth, 10), // minimum width
            height: Math.max(estimatedHeight, 10), // minimum height
          };
        } else if (obj.kind === 'line') {
          // Existing line handling remains unchanged
          if (obj.points && Array.isArray(obj.points) && obj.points.length >= 4) {
            const [x1, y1, x2, y2] = obj.points;
            const minX = Math.min(x1, x2);
            const maxX = Math.max(x1, x2);
            const minY = Math.min(y1, y2);
            const maxY = Math.max(y1, y2);
            bbox = {
              x: minX,
              y: minY,
              width: Math.max(maxX - minX, 1),
              height: Math.max(maxY - minY, 1),
            };
          } else {
            bbox = {
              x: obj.x || 0,
              y: obj.y || 0,
              width: obj.width || 50,
              height: obj.height || 2,
            };
          }
        } else {
          // Default handling for rect/ellipse if absolute coordinates present
          bbox = {
            x: obj.x || 0,
            y: obj.y || 0,
            width: obj.width || 0,
            height: obj.height || 0,
          };
        }
        
        return {
          id: obj.id,
          kind: obj.kind,
          role: obj.metadata?.role || undefined,
          text: obj.text || null,
          bbox,
        };
      });

      // 4. Assemble the final payload
      console.log(`[inspectWhiteboard] Processed ${objects.length} total objects, ${objectList.length} filtered objects`);
      
      // Log object details for debugging
      objectList.forEach(obj => {
        console.log(`[inspectWhiteboard] Object ${obj.id} (${obj.kind}): bbox ${obj.bbox.width}x${obj.bbox.height} at (${obj.bbox.x}, ${obj.bbox.y})`);
      });
      
      return {
        screenshotFileId: (screenshotResult.file_id as string | undefined) || null,
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
        screenshotFileId: null,
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