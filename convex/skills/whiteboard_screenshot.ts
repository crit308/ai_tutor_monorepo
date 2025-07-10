// @ts-nocheck
'use node';
import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { internal } from "../_generated/api";
import { uploadImageToOpenAI } from "../openaiClient";

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
    file_id: v.optional(v.string()),
    error_message: v.optional(v.string()),
    request_id: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    file_id?: string;
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
      const startTime = Date.now();
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Check for screenshot response in realtime_events
        // Look back from when we started the request, not just 1 second
        const elapsedTime = Date.now() - startTime;
        const lookbackTime = Math.max(elapsedTime + 5000, 10000); // Look back at least 10 seconds
        
        const response: { success: boolean; image_data?: string; error?: string } = await ctx.runQuery(api.websockets.getScreenshotResponse, {
          session_id: args.session_id,
          request_id: requestId,
          timeout_ms: lookbackTime,
        });
        
        if (response.success && response.image_data) {
          console.log(`[Screenshot] Successfully received screenshot for request ${requestId}`);
          
          try {
            // Upload to OpenAI Files API for vision purposes
            const fileId = await uploadImageToOpenAI(
              response.image_data,
              `whiteboard-${requestId}.png`
            );
            
            // Record the uploaded file for cleanup tracking
            await ctx.runMutation(internal.jobs.fileCleanup_db.recordUploadedFile, {
              sessionId: args.session_id,
              fileId: fileId,
              purpose: "vision",
              uploadedAt: Date.now(),
            });
            
            return {
              success: true,
              file_id: fileId,
              request_id: requestId,
            };
          } catch (uploadError) {
            console.error(`[Screenshot] Failed to upload to OpenAI Files:`, uploadError);
            return {
              success: false,
              error_message: `Failed to upload screenshot to OpenAI: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`,
              request_id: requestId,
            };
          }
        }
        
        attempts++;
        // Add debug logging every 5 attempts
        if (attempts % 5 === 0) {
          console.log(`[Screenshot] Still waiting for response, attempt ${attempts}/${maxAttempts}, request: ${requestId}`);
        }
        
        // Exponential backoff with jitter, capped at 2 seconds
        waitTime = Math.min(waitTime * 1.2 + Math.random() * 100, 2000);
      }
      
      console.warn(`[Screenshot] Timeout waiting for screenshot response for request ${requestId}`);
      
      // Timeout fallback - return error
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
    
    if (result.success && result.file_id) {
      return result.file_id;
    }
    
    // Return empty file ID as fallback
    return "";
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