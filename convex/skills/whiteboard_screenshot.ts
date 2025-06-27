import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

export const getWhiteboardScreenshot = action({
  args: { sessionId: v.id("sessions") },
  returns: v.string(),
  handler: async (ctx, { sessionId }): Promise<string> => {
    // Generate unique request ID
    const requestId = `screenshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Request screenshot from frontend via WebSocket
    await ctx.runMutation(api.websockets.requestScreenshot, {
      session_id: sessionId,
      request_id: requestId,
      target_area: "whiteboard",
    });
    
    // Wait for response with polling
    let attempts = 0;
    const maxAttempts = 20; // 10 seconds total (500ms * 20)
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
      
      const response = await ctx.runQuery(api.websockets.getScreenshotResponse, {
        session_id: sessionId,
        request_id: requestId,
        timeout_ms: 1000,
      });
      
      if (response.success) {
        return response.image_data;
      }
      
      attempts++;
    }
    
    // Timeout fallback - return empty image placeholder
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  },
}); 