"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { getOpenAIClient } from "../openaiClient";
import { components } from "../_generated/api";
import { Id } from "../_generated/dataModel";

/**
 * Vision Service for Direct OpenAI Vision API Integration
 * 
 * This service bypasses the Convex Agent component limitations
 * to provide proper vision analysis capabilities.
 */

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{
    type: "text" | "image_url";
    text?: string;
    image_url?: {
      url: string;
      detail?: "low" | "high" | "auto";
    };
  }>;
}

interface ConvexMessage {
  message?: {
    role: string;
    content: string | Array<any>;
  };
  _creationTime: number;
  userId?: string;
  [key: string]: any; // Allow additional properties
}

/**
 * Analyze whiteboard image using direct OpenAI Vision API
 */
export const analyzeWhiteboardImage = internalAction({
  args: {
    fileId: v.string(),
    threadId: v.string(),
    sessionId: v.id("sessions"),
    contextMessages: v.optional(v.array(v.any())),
    syncToThread: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.boolean(),
    analysis: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      console.log(`[VisionService] Starting vision analysis for file: ${args.fileId}`);
      
      // Get OpenAI client
      const openai = getOpenAIClient();
      
      // Retrieve the file content as base64 data
      console.log(`[VisionService] Retrieving file content for: ${args.fileId}`);
      const imageData = await getFileContentAsBase64(args.fileId);
      
      // Get recent thread context for vision analysis
      const threadMessages = await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
        threadId: args.threadId,
        paginationOpts: { numItems: 10, cursor: null },
        order: "desc",
      });
      
      // Convert Convex messages to OpenAI format
      const openaiMessages = convertToOpenAIMessages(threadMessages.page.reverse());
      
      // Add the vision instruction and image
      const visionMessages: OpenAIMessage[] = [
        {
          role: "system",
          content: `You are an AI tutor with vision capabilities. You have been asked to analyze a whiteboard screenshot. 

CRITICAL INSTRUCTIONS:
- Provide detailed, accurate visual analysis of what you actually see in the image
- If the whiteboard is blank or empty, say so explicitly
- Do not hallucinate or make up content that isn't visible
- Focus on educational content and provide constructive feedback
- Describe specific visual elements, text, diagrams, drawings, etc.
- Relate your analysis to the ongoing tutoring conversation context`
        },
        ...openaiMessages.slice(-5), // Include last 5 messages for context
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${imageData}`,
                detail: "high"
              }
            },
            {
              type: "text",
              text: "Please analyze this whiteboard screenshot and provide detailed feedback on what you see."
            }
          ]
        }
      ];
      
      console.log(`[VisionService] Sending ${visionMessages.length} messages to OpenAI Vision API`);
      console.log(`[VisionService] Using base64 data, length: ${imageData.length}`);
      console.log(`[VisionService] Context messages included: ${openaiMessages.length}`);
      
      // Call OpenAI Vision API directly
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // Vision-capable model
        messages: visionMessages as any,
        max_tokens: 1000,
        temperature: 0.7,
      });
      
      console.log(`[VisionService] OpenAI response received, choices: ${response.choices.length}`);
      
      const analysis = response.choices[0]?.message?.content;
      
      if (!analysis) {
        throw new Error("No analysis content returned from OpenAI");
      }
      
      console.log(`[VisionService] Vision analysis completed, length: ${analysis.length}`);
      console.log(`[VisionService] Analysis preview: ${analysis.substring(0, 200)}...`);
      
      // Only sync to thread if requested (for backward compatibility)
      if (args.syncToThread) {
        await syncVisionResponseToThread(ctx, args.threadId, analysis);
      }
      
      return {
        success: true,
        analysis,
      };
      
    } catch (error) {
      console.error(`[VisionService] Vision analysis failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Get file content as base64 data from OpenAI file
 */
async function getFileContentAsBase64(fileId: string): Promise<string> {
  try {
    const openai = getOpenAIClient();
    
    // Retrieve the file content from OpenAI
    const fileResponse = await openai.files.content(fileId);
    
    // Convert the response to a buffer and then to base64
    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    const base64Data = buffer.toString('base64');
    
    console.log(`[VisionService] Retrieved file content, size: ${buffer.length} bytes`);
    return base64Data;
  } catch (error) {
    console.error(`[VisionService] Failed to retrieve file content for ${fileId}:`, error);
    throw new Error(`Failed to retrieve file content: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Convert Convex Agent messages to OpenAI message format
 */
function convertToOpenAIMessages(convexMessages: ConvexMessage[]): OpenAIMessage[] {
  return convexMessages
    .filter(msg => msg.message?.content) // Filter out messages without content
    .map(msg => {
      if (!msg.message) return null; // Skip messages without message field
      
      const role = msg.userId ? "user" : "assistant";
      let content: string;
      
      // Handle different content formats
      if (typeof msg.message.content === "string") {
        content = msg.message.content;
      } else if (Array.isArray(msg.message.content)) {
        // Extract text from content array
        const textParts = msg.message.content
          .filter(part => part?.type === "text" && part?.text)
          .map(part => part.text);
        content = textParts.join("\n");
      } else {
        content = JSON.stringify(msg.message.content);
      }
      
      // Filter out placeholder messages
      if (content.trim() === "(whiteboard screenshot)" || content.trim() === "") {
        return null;
      }
      
      return {
        role: role as "user" | "assistant",
        content: content.trim(),
      };
    })
    .filter(Boolean) as OpenAIMessage[];
}

/**
 * Sync vision analysis response back to Convex thread
 */
async function syncVisionResponseToThread(
  ctx: any,
  threadId: string,
  analysis: string
): Promise<void> {
  console.log(`[VisionService] Syncing vision response to thread: ${threadId}`);
  
  try {
    // Add the vision analysis as an assistant message to the thread
    await ctx.runMutation(components.agent.messages.addMessages, {
      threadId,
      messages: [
        {
          message: {
            role: "assistant",
            content: analysis,
          },
        },
      ],
    });
    
    console.log(`[VisionService] Vision response synced successfully`);
  } catch (error) {
    console.error(`[VisionService] Failed to sync vision response:`, error);
    throw error;
  }
}

/**
 * Test function to validate vision service functionality
 */
export const testVisionService = internalAction({
  args: {
    fileId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    analysis: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      console.log(`[VisionService Test] Testing with file ID: ${args.fileId}`);
      
      const openai = getOpenAIClient();
      
      // Simple test message with just the image
      const testMessages: OpenAIMessage[] = [
        {
          role: "system",
          content: "You are a vision AI. Describe what you see in the image in detail."
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${await getFileContentAsBase64(args.fileId)}`,
                detail: "high"
              }
            },
            {
              type: "text",
              text: "What do you see in this image?"
            }
          ]
        }
      ];
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: testMessages as any,
        max_tokens: 500,
        temperature: 0.7,
      });
      
      const analysis = response.choices[0]?.message?.content;
      
      if (!analysis) {
        return {
          success: false,
          message: "No response from OpenAI Vision API",
        };
      }
      
      return {
        success: true,
        message: "Vision service test completed successfully",
        analysis,
      };
      
    } catch (error) {
      console.error(`[VisionService Test] Failed:`, error);
      return {
        success: false,
        message: `Test failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
}); 