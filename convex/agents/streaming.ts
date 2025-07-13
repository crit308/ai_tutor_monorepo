// @ts-nocheck
import { requireAuth } from "../auth/middleware";
import { internalAction, internalMutation, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { Agent, vStreamArgs } from "@convex-dev/agent";
import { openai } from "@ai-sdk/openai";
import { WHITEBOARD_SKILLS_PROMPT } from "./whiteboard_agent";
import { whiteboardTools } from "./whiteboard_tools";

// ------------------------------------------------------------------
// Model selection
// Use env var OPENAI_MODEL if provided, otherwise default to GPT-4.1 2025-04-14
// ------------------------------------------------------------------
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-2025-04-14";

// Extra guidance so the LLM emits a pure JSON skill call when drawing is needed
const JSON_SKILL_INSTRUCTION = `When calling tools, respond with either a SINGLE JSON object or an ARRAY of such objects, each following: { "skill_name": "<string>", "skill_args": { ... } }. Do NOT wrap in markdown fences or add prose around it.

Rules for when to call tools:
• If the student explicitly asks you to draw, sketch, annotate, use the board / whiteboard / canvas, or requests a diagram/visual, you MUST respond with appropriate whiteboard tool calls (usually start with inspect_whiteboard to see the current state).  
• Always include both "sessionId" and "threadId" fields in every tool call.
• The sessionId is provided in the **SessionId** line of the system prompt below.
• The threadId is the current conversation thread ID you're responding in.

For inspect_whiteboard tool:
• This tool returns real-time visual analysis of the whiteboard, not just a file ID.
• You'll get a description of what's on the whiteboard directly from the tool.
• No need to wait for image messages - the analysis is immediate.

IMPORTANT: 
• When asked about the whiteboard or to check/inspect it, IMMEDIATELY call inspect_whiteboard.
• When starting a new tutoring session, consider calling inspect_whiteboard to see if there's any existing content.
• Don't just describe what you CAN do - actually DO it by calling the tool.`;

// Create the AI Tutor Agent using the Convex Agent component
const tutorAgent = new Agent(components.agent, {
  name: "AI Tutor",
  chat: openai.responses(OPENAI_MODEL),
  textEmbedding: openai.embedding("text-embedding-3-small"),
  instructions: "You are a helpful AI tutor. Provide clear, educational responses that help students learn effectively.",
  tools: whiteboardTools,
});



/**
 * Get or create session thread
 */
export const getOrCreateSessionThread = mutation({
  args: {
    sessionId: v.id("sessions"),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    
    // Get the session
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Access denied: Session not found or not owned by user");
    }
    
    // Check if thread already exists
    const existingThreadId = session.context_data?.agent_thread_id;
    if (existingThreadId) {
      return existingThreadId;
    }
    
    // Create new thread
    const { threadId } = await tutorAgent.createThread(ctx, { userId });
    
    // Update session with thread ID
    await ctx.db.patch(args.sessionId, {
      context_data: {
        ...session.context_data,
        agent_thread_id: threadId,
      }
    });
    
    return threadId;
  },
});

/**
 * List thread messages with streaming support
 */
export const listThreadMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  returns: v.object({
    page: v.array(v.any()),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    streams: v.optional(v.any()),
  }),
  handler: async (ctx, args) => {
    // Require authentication
    const userId = await requireAuth(ctx);
    
    // Verify user has access to this thread by checking if they own a session with this thread
    const sessionWithThread = await ctx.db
      .query("sessions")
      .filter((q) => 
        q.and(
          q.eq(q.field("user_id"), userId),
          q.eq(q.field("context_data.agent_thread_id"), args.threadId)
        )
      )
      .first();
      
    if (!sessionWithThread) {
      throw new Error("Access denied: Thread not found or not owned by user");
    }
    
    // Get streaming data using the agent's syncStreams
    const streams = await tutorAgent.syncStreams(ctx, { 
      threadId: args.threadId, 
      streamArgs: args.streamArgs 
    });
    
    // Get paginated messages from agent component
    const paginated = await tutorAgent.listMessages(ctx, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
    
    return {
      ...paginated,
      streams,
    };
  },
});

/**
 * Send a message to a thread with streaming support using agent
 */
export const sendStreamingMessage = mutation({
  args: {
    threadId: v.string(),
    message: v.string(),
    sessionId: v.optional(v.id("sessions")),
  },
  returns: v.object({
    messageId: v.string(),
  }),
  handler: async (ctx, args) => {
    // Require authentication
    const userId = await requireAuth(ctx);
    
    // Verify user has access to this thread
    const sessionWithThread = await ctx.db
      .query("sessions")
      .filter((q) => 
        q.and(
          q.eq(q.field("user_id"), userId),
          q.eq(q.field("context_data.agent_thread_id"), args.threadId)
        )
      )
      .first();
      
    if (!sessionWithThread) {
      throw new Error("Access denied: Thread not found or not owned by user");
    }
    
    // Save the user message using the agent
    const { messageId } = await tutorAgent.saveMessage(ctx, {
      threadId: args.threadId,
      prompt: args.message,
      skipEmbeddings: true, // We're in a mutation, embeddings will be generated during streaming
    });
    
    // Schedule AI response with streaming
    await ctx.scheduler.runAfter(0, internal.agents.streaming.generateStreamingResponse, {
      threadId: args.threadId,
      sessionId: args.sessionId,
      promptMessageId: messageId,
      followUpForVisionAnalysis: false, // Default value for normal responses
    });
    
    return { messageId };
  },
});

/**
 * Internal version of sendStreamingMessage
 */
export const sendStreamingMessageInternal = internalMutation({
  args: {
    threadId: v.string(),
    message: v.string(),
    sessionId: v.optional(v.id("sessions")),
  },
  returns: v.object({
    messageId: v.string(),
  }),
  handler: async (ctx, args) => {
    // Save the user message using the agent
    const { messageId } = await tutorAgent.saveMessage(ctx, {
      threadId: args.threadId,
      prompt: args.message,
      skipEmbeddings: true,
    });
    
    // Schedule AI response with streaming
    await ctx.scheduler.runAfter(0, internal.agents.streaming.generateStreamingResponse, {
      threadId: args.threadId,
      sessionId: args.sessionId,
      promptMessageId: messageId,
      followUpForVisionAnalysis: false, // Default value for normal responses
    });
    
    return { messageId };
  },
});

/**
 * Generate streaming AI response using the Agent component
 */
export const generateStreamingResponse = internalAction({
  args: {
    threadId: v.string(),
    sessionId: v.optional(v.id("sessions")),
    promptMessageId: v.string(),
    followUpForVisionAnalysis: v.optional(v.boolean()), // Flag to indicate this is a follow-up for vision analysis
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      console.log(`[Agent Streaming] Starting OpenAI stream for thread: ${args.threadId}, followUp: ${args.followUpForVisionAnalysis || false}`);
      
      // Get enhanced system prompt with knowledge base context
      let customInstructions = "You are a helpful AI tutor. Provide clear, educational responses that help students learn effectively.";
      
      // If this is a follow-up for vision analysis, provide specific instructions
      if (args.followUpForVisionAnalysis) {
        customInstructions = `You are a helpful AI tutor. You just sent an image-only message containing a whiteboard screenshot. 

**CRITICAL INSTRUCTION**: You must now provide visual analysis of the whiteboard image that was just embedded in the previous message. The image is already in the conversation context, so you can see it and should analyze it.

**DO NOT** call inspect_whiteboard again. **DO NOT** send another image-only message.

**YOUR TASK**: Provide detailed visual analysis of the whiteboard screenshot that was just embedded. Describe what you see, analyze the content, and provide educational feedback based on the visual content.

If the whiteboard appears blank or empty, say so explicitly and offer to help create educational content.

Respond with regular text describing what you observe in the image.`;
      } else {
        // Append whiteboard skills prompt for normal responses
        customInstructions += "\n\n" + WHITEBOARD_SKILLS_PROMPT + JSON_SKILL_INSTRUCTION;
      }
      
      // Only enrich with knowledge base & whiteboard tool instructions for normal responses,
      // NOT for follow-up vision analysis (to avoid reintroducing tool prompts).
      if (!args.followUpForVisionAnalysis && args.sessionId) {
        try {
          // Get session to access knowledge base
          const session = await ctx.runQuery(internal.functions.getSessionInternal, {
            sessionId: args.sessionId
          });
          
          if (session) {
            const focusObjective = session.context_data?.focus_objective;
            if (focusObjective) {
              customInstructions += `\n\n**FOCUS OBJECTIVE:**\nTopic: ${focusObjective.topic}\nGoal: ${focusObjective.learning_goal}\nRelevant Concepts: ${focusObjective.relevant_concepts?.join(", ") || ""}`;
            }
          }
          
          if (session && session.folder_id) {
            // Get folder with knowledge base
            const folder = await ctx.runQuery(internal.functions.getFolderInternal, {
              folderId: session.folder_id as Id<"folders">
            });
            
            if (folder && folder.knowledge_base) {
              const knowledgeBase = folder.knowledge_base;
              
              // Get the latest message to check if it's a planner message
              const messages = await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
                threadId: args.threadId,
                paginationOpts: { numItems: 5, cursor: null },
                order: "desc",
              });
              
              const latestMessage = messages.page[0];
              const messageContent: string = (latestMessage?.message?.content || latestMessage?.text || "") as string;
              
              if (messageContent.includes("INTERNAL_PLANNER_MESSAGE")) {
                // This is the initial planning phase - analyze and immediately start tutoring
                customInstructions = `You are an AI Tutor starting a new learning session.

**KNOWLEDGE BASE CONTENT:**
${knowledgeBase}

**YOUR TASK:**
1. Analyze the knowledge base content to understand what the student needs to learn
2. Identify the key learning objectives and concepts
3. Immediately start the tutoring session with a warm welcome
4. Begin teaching the most important topics from the knowledge base

**INSTRUCTIONS:**
- Start with a friendly welcome message introducing yourself and the topic
- Briefly mention what you'll be covering based on the uploaded materials
- Begin with fundamental concepts before moving to advanced topics
- Ask an engaging question or present an interesting fact to start the learning
- Use a conversational, encouraging tone
- Make the student feel excited about learning

Start the tutoring session now with your welcome message.` + "\n\n" + WHITEBOARD_SKILLS_PROMPT + JSON_SKILL_INSTRUCTION;
              } else {
                // This is the executor agent or normal tutoring
                customInstructions = `You are an AI Tutor providing personalized education assistance.

**KNOWLEDGE BASE CONTENT:**
${knowledgeBase}

**YOUR ROLE:**
- Provide engaging, interactive tutoring based on the uploaded materials
- Welcome the student warmly and create a positive learning environment
- Ask questions, give clear explanations, and guide the student's learning
- Use the whiteboard feature when helpful (mention drawing diagrams or visual aids)
- Encourage active participation and critical thinking
- Adapt your teaching style to the student's needs and understanding level

**INSTRUCTIONS:**
- Start by welcoming the student and introducing the topic from the knowledge base
- Begin with fundamental concepts before moving to advanced topics
- Ask engaging questions to assess understanding and keep the student involved
- Provide clear explanations with relevant examples
- Be encouraging, supportive, and patient
- Use a conversational, friendly tone
- When appropriate, suggest visual elements for the whiteboard
- Focus on helping the student understand and learn effectively

Begin the tutoring session now with a warm welcome and introduction to the topic.` + "\n\n" + WHITEBOARD_SKILLS_PROMPT + JSON_SKILL_INSTRUCTION;
              }
            }
          }
          
          // Provide current boardVersion number (for lastKnownVersion in patches)
          if (args.sessionId) {
            try {
              const boardVersionDoc = await ctx.runQuery(internal.functions.getSessionInternal, {
                sessionId: args.sessionId,
              });
              const boardVersion = (boardVersionDoc as any)?.board_version ?? 0;
              customInstructions += `\nCurrent boardVersion: ${boardVersion}. Include this as lastKnownVersion when applying patches.`;
            } catch (e) {
              console.error("[Agent Streaming] Could not fetch boardVersion", e);
            }
          }

          // Surface the exact sessionId and threadId so the model can include them in tool calls
          if (args.sessionId) {
            customInstructions += `\nSessionId: ${args.sessionId}`;
          }
          customInstructions += `\nThreadId: ${args.threadId}`;
        } catch (error) {
          console.log("[Agent Streaming] Could not load knowledge base context:", error);
        }
      }

      // Vision analysis now happens directly in the inspect_whiteboard tool
      // No need to detect markers or schedule follow-ups

      // Create a new agent instance with custom instructions for this specific response
      const customAgent = new Agent(components.agent, {
        name: "AI Tutor",
        chat: openai.responses(OPENAI_MODEL),
        textEmbedding: openai.embedding("text-embedding-3-small"),
        instructions: customInstructions,
        tools: args.followUpForVisionAnalysis ? {} : whiteboardTools, // Remove tools in follow-up to prevent calling inspect_whiteboard again
        maxSteps: 6,
      });

      // Continue the thread and stream the response using the custom agent
      const { thread } = await customAgent.continueThread(ctx, { 
        threadId: args.threadId,
      });
      
      // Stream the response using the agent's built-in streaming
      const result = await thread.streamText(
        {
          promptMessageId: args.promptMessageId,
        },
        {
          saveStreamDeltas: false,
        }
      );
      
      // Consume the stream to ensure it completes
      await result.consumeStream();
      
      const fullResponse = await result.text;
      console.log(`[Agent Streaming] Completed OpenAI stream, response length: ${fullResponse.length}`);
      console.log("[Agent Streaming] Raw assistant response:", fullResponse);
      
      // Log the result object to see what properties are available
      console.log("[Agent Streaming] Result object keys:", Object.keys(result));
      console.log("[Agent Streaming] Result toolCalls:", (result as any).toolCalls);
      console.log("[Agent Streaming] Result steps:", (result as any).steps);
      
      // Check if there's a way to access the tool calls
      if ((result as any).toolCalls || (result as any).steps) {
        console.log("[Agent Streaming] Found tool call information in result");
        
        // Try to await the promises
        try {
          const toolCalls = await (result as any).toolCallsPromise;
          console.log("[Agent Streaming] Resolved toolCalls:", toolCalls);
          
          // Check if inspect_whiteboard was called
          if (toolCalls && Array.isArray(toolCalls)) {
            for (const toolCall of toolCalls) {
              console.log("[Agent Streaming] Tool call:", toolCall.name, toolCall.result);
              if (toolCall.name === "inspect_whiteboard" && toolCall.result) {
                const resultStr = typeof toolCall.result === "string" ? toolCall.result : JSON.stringify(toolCall.result);
                const match = resultStr.match(/\[WHITEBOARD_SCREENSHOT:([^\]]+)\]/);
                if (match) {
                  const fileId = match[1];
                  console.log("[Agent Streaming] Found whiteboard screenshot in tool result:", fileId);
                  
                  // Inject the screenshot as an image message
                  const addRes = await ctx.runMutation(components.agent.messages.addMessages, {
                    threadId: args.threadId,
                    messages: [
                      {
                        message: {
                          role: "assistant",
                          content: [
                            {
                              type: "file",
                              data: fileId,
                              mimeType: "image/png",
                              filename: "whiteboard.png",
                            },
                            {
                              type: "text",
                              text: "(whiteboard screenshot)",
                            },
                          ],
                        },
                      },
                    ],
                  });

                  const injectedId = addRes?.messages?.[0]?._id ?? args.promptMessageId;

                  // Schedule a follow-up response for vision analysis
                  await ctx.scheduler.runAfter(0, internal.agents.streaming.generateStreamingResponse, {
                    threadId: args.threadId,
                    sessionId: args.sessionId,
                    promptMessageId: injectedId,
                    followUpForVisionAnalysis: true,
                  });

                  console.log("[Agent Streaming] Follow-up vision analysis scheduled from tool result");
                  return null;
                }
              }
            }
          }
        } catch (e) {
          console.log("[Agent Streaming] Error accessing tool calls:", e);
        }
      }
      
    } catch (error) {
      console.error("[Agent Streaming] Error generating response:", error);
      
      // Create an error message using the agent
      const errorText = `I apologize, but I encountered an error: ${error instanceof Error ? error.message : String(error)}`;
      
      await tutorAgent.saveMessage(ctx, {
        threadId: args.threadId,
        prompt: errorText,
        skipEmbeddings: true,
      });
    }
    
    return null;
  },
});

/**
 * Migrate a session to use agent threads (for backward compatibility)
 */
export const migrateSessionToThread = mutation({
  args: {
    sessionId: v.id("sessions"),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Access denied: Session not found or not owned by user");
    }
    
    // Create new thread using the agent
    const { threadId } = await tutorAgent.createThread(ctx, { userId });
    
    // Update session with thread ID
    await ctx.db.patch(args.sessionId, {
      context_data: {
        ...session.context_data,
        agent_thread_id: threadId,
      }
    });
    
    // Migrate existing messages to thread if any
    const existingMessages = await ctx.db
      .query("session_messages")
      .withIndex("by_session_created", (q) => q.eq("session_id", args.sessionId))
      .order("asc")
      .collect();
    
    if (existingMessages.length > 0) {
      // Convert session messages to thread messages using the agent's format
      for (const msg of existingMessages) {
        await tutorAgent.saveMessage(ctx, {
          threadId,
          prompt: msg.text || "",
          skipEmbeddings: true,
        });
      }
    }
    
    return threadId;
  },
}); 