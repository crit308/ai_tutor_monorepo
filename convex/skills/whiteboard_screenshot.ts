import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

/**
 * Enhanced Convex-native screenshot system
 * Uses Convex real-time events instead of external WebSocket for better integration
 */

export const requestWhiteboardScreenshot = action({
  args: { 
    session_id: v.string(),
    request_context: v.optional(v.string()), // Why the screenshot is needed
  },
  returns: v.object({
    success: v.boolean(),
    image_data: v.optional(v.string()),
    error_message: v.optional(v.string()),
    request_id: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    image_data?: string;
    error_message?: string;
    request_id: string;
  }> => {
    try {
      // Generate unique request ID
      const requestId = `screenshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      console.log(`[Screenshot] Requesting screenshot for session ${args.session_id}, context: ${args.request_context || 'N/A'}`);
      
      // Send screenshot request via Convex real-time events
      await ctx.runMutation(api.websockets.sendToSession, {
        session_id: args.session_id,
        data: {
          type: "screenshot_request",
          request_id: requestId,
          target_area: "whiteboard",
          context: args.request_context,
          timestamp: Date.now(),
        }
      });
      
      // Wait for response with exponential backoff
      let attempts = 0;
      const maxAttempts = 25; // 30+ seconds total with exponential backoff
      let waitTime = 200; // Start with 200ms
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Check for screenshot response in realtime_events
        const response: { success: boolean; image_data?: string; error?: string } = await ctx.runQuery(api.websockets.getScreenshotResponse, {
          session_id: args.session_id,
          request_id: requestId,
          timeout_ms: 1000,
        });
        
        if (response.success && response.image_data) {
          console.log(`[Screenshot] Successfully received screenshot for request ${requestId}`);
          return {
            success: true,
            image_data: response.image_data,
            request_id: requestId,
          };
        }
        
        attempts++;
        // Exponential backoff with jitter, capped at 2 seconds
        waitTime = Math.min(waitTime * 1.2 + Math.random() * 100, 2000);
      }
      
      console.warn(`[Screenshot] Timeout waiting for screenshot response for request ${requestId}`);
      
      // Timeout fallback - return error with fallback
      return {
        success: false,
        error_message: "Screenshot request timed out. The frontend may not be connected or screenshot capture failed.",
        request_id: requestId,
      };
      
    } catch (error) {
      console.error(`[Screenshot] Error requesting screenshot:`, error);
      return {
        success: false,
        error_message: `Screenshot request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        request_id: `error-${Date.now()}`,
      };
    }
  },
});

// Legacy compatibility - keep the old function name but redirect to new one
export const getWhiteboardScreenshot = action({
  args: { sessionId: v.id("sessions") },
  returns: v.string(),
  handler: async (ctx, { sessionId }): Promise<string> => {
    const result = await ctx.runAction(api.skills.whiteboard_screenshot.requestWhiteboardScreenshot, {
      session_id: sessionId,
      request_context: "Legacy API call",
    });
    
    if (result.success && result.image_data) {
      return result.image_data;
    }
    
    // Return minimal fallback image
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  },
});

// Store screenshot response from frontend
export const submitScreenshotResponse = action({
  args: {
    session_id: v.string(),
    request_id: v.string(),
    image_data: v.string(),
    success: v.boolean(),
    error_message: v.optional(v.string()),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    try {
      // Store the screenshot response in realtime_events
      await ctx.runMutation(api.websockets.receiveScreenshot, {
        session_id: args.session_id,
        request_id: args.request_id,
        image_data: args.image_data,
        metadata: {
          width: 0, // Will be filled by frontend if needed
          height: 0, // Will be filled by frontend if needed
          format: "png",
          timestamp: Date.now(),
        }
      });
      
      console.log(`[Screenshot] Response stored for request ${args.request_id}, success: ${args.success}`);
      return { success: true };
    } catch (error) {
      console.error(`[Screenshot] Error storing response:`, error);
      return { success: false };
    }
  },
}); 