import { query, mutation, action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { components, api } from "../_generated/api";
import { paginationOptsValidator } from "convex/server";
import { internal } from "../_generated/api";
import { requireAuth } from "../auth/middleware";
import { Id } from "../_generated/dataModel";

/**
 * Create a new thread for streaming messages, linked to a session
 */
export const createSessionThread = mutation({
  args: {
    sessionId: v.id("sessions"),
    userId: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    // Require authentication
    const userId = await requireAuth(ctx);
    
    // Verify session exists and user has access
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    // Verify user owns the session
    if (session.user_id !== userId) {
      throw new Error("Access denied: Session belongs to different user");
    }
    
    // Create thread using agent component
    const threadResult = await ctx.runMutation(components.agent.threads.createThread, {
      userId: args.userId || session.user_id,
      title: args.title || `Session ${args.sessionId}`,
    });
    const threadId = threadResult._id;
    
    // Update session to link to thread
    await ctx.db.patch(args.sessionId, {
      context_data: {
        ...session.context_data,
        agent_thread_id: threadId,
        streaming_enabled: true,
      },
      updated_at: Date.now(),
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
    streamArgs: v.optional(v.union(
      v.object({ kind: v.literal("list") }),
      v.object({ 
        kind: v.literal("deltas"),
        cursors: v.array(v.object({
          streamId: v.string(),
          cursor: v.number(),
        }))
      })
    )),
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
    
    // Get paginated messages from agent component
    const paginated = await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
      order: "asc",
    });
    
    // Get streaming data if requested
    let streams = undefined;
    if (args.streamArgs) {
      if (args.streamArgs.kind === "list") {
        const streamList = await ctx.runQuery(components.agent.streams.list, {
          threadId: args.threadId,
        });
        streams = {
          kind: "list" as const,
          messages: streamList,
        };
      } else if (args.streamArgs.kind === "deltas") {
        const deltaList = await ctx.runQuery(components.agent.streams.listDeltas, {
          threadId: args.threadId,
          cursors: args.streamArgs.cursors,
        });
        streams = {
          kind: "deltas" as const,
          deltas: deltaList,
        };
      }
    }
    
    return {
      ...paginated,
      streams,
    };
  },
});

/**
 * Send a message to a thread with streaming support
 */
export const sendStreamingMessage = mutation({
  args: {
    threadId: v.string(),
    message: v.string(),
    sessionId: v.optional(v.id("sessions")),
  },
  returns: v.object({
    messageId: v.string(),
    streamId: v.optional(v.string()),
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
    
    // Add user message to thread
    const messageResult = await ctx.runMutation(components.agent.messages.addMessages, {
      threadId: args.threadId,
      messages: [{
        message: {
          role: "user",
          content: args.message,
        },
      }],
    });
    
    // Also log to session_messages for backward compatibility
    if (args.sessionId) {
      const session = await ctx.db.get(args.sessionId);
      if (session) {
        // Get next turn number
        const existingMessages = await ctx.db
          .query("session_messages")
          .withIndex("by_session_created", (q) => q.eq("session_id", args.sessionId as string))
          .collect();
        
        const nextTurnNo = existingMessages.length + 1;
        
        await ctx.db.insert("session_messages", {
          session_id: args.sessionId,
          role: "user",
          text: args.message,
          turn_no: nextTurnNo,
          created_at: Date.now(),
        });
      }
    }
    
    // Schedule AI response  
    await ctx.scheduler.runAfter(0, internal.agents.streaming.generateStreamingResponse, {
      threadId: args.threadId,
      sessionId: args.sessionId,
    });
    
    return {
      messageId: messageResult.messages[0]._id,
    };
  },
});

/**
 * Generate streaming AI response
 */
export const generateStreamingResponse = internalAction({
  args: {
    threadId: v.string(),
    sessionId: v.optional(v.id("sessions")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      // Get thread messages for context
      const messages = await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
        threadId: args.threadId,
        paginationOpts: { numItems: 20, cursor: null },
        order: "asc",
      });
      
      // Get latest user message (check both direct role and nested message.role)
      const userMessages = messages.page.filter((msg: any) => 
        msg.role === "user" || msg.message?.role === "user"
      );
      const latestUserMessage = userMessages[userMessages.length - 1];
      
      if (!latestUserMessage) {
        console.error("No user message found in thread, available messages:", 
          messages.page.map((m: any) => ({ id: m._id, role: m.role, messageRole: m.message?.role, text: m.text?.slice(0, 50) }))
        );
        return null;
      }
      
              // Get enhanced system prompt with knowledge base context
      let systemPrompt = "You are a helpful AI tutor. Provide clear, educational responses that help students learn effectively.";
      
      if (args.sessionId) {
        try {
          // Get session to access knowledge base
          const session = await ctx.runQuery(internal.functions.getSessionInternal, {
            sessionId: args.sessionId
          });
          
          if (session && session.folder_id) {
            // Get folder with knowledge base
            const folder = await ctx.runQuery(internal.functions.getFolderInternal, {
              folderId: session.folder_id as Id<"folders">
            });
            
            if (folder && folder.knowledge_base) {
              const knowledgeBase = folder.knowledge_base;
              
              // Check if this is an internal planner message
              const latestMessage = messages.page[messages.page.length - 1];
              const messageContent: string = (latestMessage?.message?.content || latestMessage?.text || "") as string;
              
              if (messageContent.includes("INTERNAL_PLANNER_MESSAGE")) {
                // This is the planner agent
                systemPrompt = `You are the Planner Agent in a two-agent tutoring system.

**KNOWLEDGE BASE CONTENT:**
${knowledgeBase}

**YOUR ROLE AS PLANNER:**
1. Analyze the knowledge base content thoroughly
2. Identify key learning objectives and concepts
3. Determine the best learning path and focus areas
4. Create a lesson plan with clear objectives
5. Hand off to the Executor Agent with specific instructions

**TASK:**
Analyze the knowledge base and create a comprehensive lesson plan. Then provide handoff instructions to the Executor Agent.

Your response should include:
1. Analysis of the knowledge base content
2. Key concepts and learning objectives identified
3. Recommended learning sequence
4. Specific instructions for the Executor Agent
5. Clear handoff message

After your analysis, end with: "HANDOFF_TO_EXECUTOR: [your specific instructions for the Executor Agent]"

Do not interact with the student directly - your role is purely planning and analysis.`;
              } else {
                // This is the executor agent or normal tutoring
                systemPrompt = `You are the Executor Agent in a two-agent tutoring system.

**KNOWLEDGE BASE CONTENT:**
${knowledgeBase}

**YOUR ROLE AS EXECUTOR:**
- Start the actual tutoring session with the student
- Welcome the student with an engaging, warm introduction
- Begin teaching based on the lesson plan from the Planner Agent
- Provide engaging, interactive tutoring based on the uploaded materials
- Ask questions, give explanations, and guide the student's learning
- Use the whiteboard feature when helpful (mention drawing diagrams or visual aids)
- Encourage active participation and critical thinking

**INSTRUCTIONS:**
- If you receive EXECUTOR_START or handoff instructions from the Planner Agent, follow them closely
- Start by welcoming the student and introducing the topic
- Begin with fundamental concepts before moving to advanced topics
- Ask engaging questions to assess understanding
- Provide clear explanations with examples
- Be encouraging and supportive
- Use a conversational, friendly tone
- When appropriate, suggest visual elements for the whiteboard
- Never mention internal messages or the two-agent system to the student

When you receive EXECUTOR_START instructions, immediately begin the tutoring session with a warm welcome.`;
              }
            }
          }
        } catch (error) {
          console.log("[Agent Streaming] Could not load knowledge base context:", error);
        }
      }

      // Create streaming message
      const streamId = await ctx.runMutation(components.agent.streams.create, {
        threadId: args.threadId,
        order: messages.page.length + 1,
        stepOrder: 0,
      });
      
      // Initialize OpenAI for streaming
      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY 
      });

      // Convert thread messages to OpenAI format
      const openaiMessages = [
        { role: "system" as const, content: systemPrompt },
        ...messages.page.map((msg: any) => ({
          role: (msg.message?.role || msg.role) as "user" | "assistant",
          content: msg.message?.content || msg.text || msg.content || "",
        }))
      ];

      console.log(`[Agent Streaming] Starting OpenAI stream for thread: ${args.threadId}`);

      // Create OpenAI streaming completion
      const stream = await openai.chat.completions.create({
        model: "gpt-4",
        messages: openaiMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2000
      });

      let fullResponse = "";
      let chunkIndex = 0;
      
      // Stream response chunks
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) {
          fullResponse += text;
          
          // Send streaming delta
          const delta = {
            streamId,
            start: chunkIndex,
            end: chunkIndex + text.length,
            parts: [{
              type: "text-delta" as const,
              textDelta: text,
            }],
          };
          
          await ctx.runMutation(components.agent.streams.addDelta, delta);
          chunkIndex += text.length;
        }
      }
      
      console.log(`[Agent Streaming] Completed OpenAI stream, response length: ${fullResponse.length}`);
      
      // Finish the stream and save the final message
      await ctx.runMutation(components.agent.streams.finish, {
        streamId,
      });
      
      // Also add the complete message to the thread for persistence
      await ctx.runMutation(components.agent.messages.addMessages, {
        threadId: args.threadId,
        messages: [{
          message: {
            role: "assistant",
            content: fullResponse,
          },
        }],
      });

      // Check if this was a planner agent response that needs handoff to executor
      if (fullResponse.includes("HANDOFF_TO_EXECUTOR:")) {
        console.log("[Agent Streaming] Planner completed, triggering executor agent...");
        
        // Extract handoff instructions
        const handoffMatch = fullResponse.match(/HANDOFF_TO_EXECUTOR:\s*(.+)/s);
        const executorInstructions = handoffMatch ? handoffMatch[1].trim() : "Begin the tutoring session based on the lesson plan.";
        
        // Trigger executor agent automatically
        const executorMessage = `EXECUTOR_START: ${executorInstructions}

Begin the tutoring session now. Welcome the student and start teaching based on the lesson plan.`;

        // Add executor message to thread
        await ctx.runMutation(components.agent.messages.addMessages, {
          threadId: args.threadId,
          messages: [{
            message: {
              role: "user",
              content: executorMessage,
            },
          }],
        });

        // Schedule executor agent to run immediately
        try {
          await ctx.scheduler.runAfter(0, internal.agents.streaming.generateStreamingResponse, {
            threadId: args.threadId,
            sessionId: args.sessionId,
          });
        } catch (error) {
          console.error("[Agent Streaming] Failed to schedule executor agent:", error);
        }
      }
    
    } catch (error) {
      console.error("[Agent Streaming] Error generating response:", error);
      
      // Send error message as stream
      const errorMessage = `I apologize, but I encountered an error: ${error instanceof Error ? error.message : String(error)}`;
      
      const streamId = await ctx.runMutation(components.agent.streams.create, {
        threadId: args.threadId,
        order: 1,
        stepOrder: 0,
      });
      
      const delta = {
        streamId,
        start: 0,
        end: errorMessage.length,
        parts: [{
          type: "text-delta" as const,
          textDelta: errorMessage,
        }],
      };
      
      await ctx.runMutation(components.agent.streams.addDelta, delta);
    }
    
    // Note: stream is automatically finished when no more deltas are sent
    
          // Note: backward compatibility with session_messages is handled in sendStreamingMessage
    
    return null;
  },
});

/**
 * Get thread ID for a session (create if doesn't exist)
 */
export const getOrCreateSessionThread = mutation({
  args: {
    sessionId: v.id("sessions"),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    // Require authentication
    const userId = await requireAuth(ctx);
    
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    // Verify user owns the session
    if (session.user_id !== userId) {
      throw new Error("Access denied: Session belongs to different user");
    }
    
    // Check if thread already exists
    if (session.context_data?.agent_thread_id) {
      return session.context_data.agent_thread_id;
    }
    
    // Create new thread
    const threadResult = await ctx.runMutation(components.agent.threads.createThread, {
      userId: session.user_id,
      title: `Session ${args.sessionId}`,
    });
    const threadId = threadResult._id;
    
    // Update session context
    await ctx.db.patch(args.sessionId, {
      context_data: {
        ...session.context_data,
        agent_thread_id: threadId,
        streaming_enabled: true,
      },
      updated_at: Date.now(),
    });
    
    return threadId;
  },
});

/**
 * Migrate existing session messages to agent thread
 */
export const migrateSessionToThread = mutation({
  args: {
    sessionId: v.id("sessions"),
  },
  returns: v.object({
    threadId: v.string(),
    migratedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    // Get or create thread
    let threadId = session.context_data?.agent_thread_id;
    if (!threadId) {
      const threadResult = await ctx.runMutation(components.agent.threads.createThread, {
        userId: session.user_id,
        title: `Session ${args.sessionId} (Migrated)`,
      });
      threadId = threadResult._id;
      
      await ctx.db.patch(args.sessionId, {
        context_data: {
          ...session.context_data,
          agent_thread_id: threadId,
          streaming_enabled: true,
        },
        updated_at: Date.now(),
      });
    }
    
    // Get existing session messages
    const sessionMessages = await ctx.db
      .query("session_messages")
      .withIndex("by_session_turn", (q) => q.eq("session_id", args.sessionId))
      .order("asc")
      .collect();
    
    // Convert to agent messages format
    const agentMessages = sessionMessages.map(msg => ({
      message: {
        role: msg.role as "user" | "assistant",
        content: msg.text || "",
      },
    }));
    
    // Add messages to thread
    if (agentMessages.length > 0) {
      await ctx.runMutation(components.agent.messages.addMessages, {
        threadId,
        messages: agentMessages,
      });
    }
    
    return {
      threadId,
      migratedCount: agentMessages.length,
    };
  },
});

/**
 * Trigger lesson planner automatically when knowledge base is created
 */
export const triggerLessonPlanner = internalAction({
  args: {
    threadId: v.string(),
    sessionId: v.id("sessions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      console.log("[Agent Streaming] Triggering lesson planner for session:", args.sessionId);
      
      // Add planner message to thread to start the lesson planning process
      const plannerMessage = `INTERNAL_PLANNER_MESSAGE: Initialize two-agent learning session

You are the Planner Agent. Your task is to:
1. ANALYZE the knowledge base from uploaded materials
2. IDENTIFY key learning objectives and concepts  
3. CREATE a lesson plan with focus objectives
4. HANDOFF to the Executor Agent with instructions

After analysis, you must hand off to the Executor Agent who will:
- Start the actual tutoring session
- Welcome the student with an engaging introduction
- Begin teaching based on your plan
- Use a conversational, encouraging tone

IMPORTANT: Your planning message should be INTERNAL ONLY and not shown to the student. The first visible message should be from the Executor Agent welcoming the student.

Analyze the knowledge base and create the handoff instructions now.`;

      // Add the planner message to the thread
      await ctx.runMutation(components.agent.messages.addMessages, {
        threadId: args.threadId,
        messages: [{
          message: {
            role: "user",
            content: plannerMessage,
          },
        }],
      });

      // Trigger the planner agent to respond
      await ctx.scheduler.runAfter(0, internal.agents.streaming.generateStreamingResponse, {
        threadId: args.threadId,
        sessionId: args.sessionId,
      });

      console.log("[Agent Streaming] Lesson planner triggered successfully");
      
    } catch (error) {
      console.error("[Agent Streaming] Failed to trigger lesson planner:", error);
    }
    
    return null;
  },
}); 