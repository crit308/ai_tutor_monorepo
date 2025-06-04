import { query, mutation, action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { components, api } from "../_generated/api";
import { paginationOptsValidator } from "convex/server";
import { internal } from "../_generated/api";
import { requireAuth } from "../auth/middleware";

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
    // Create streaming message
    const streamId = await ctx.runMutation(components.agent.streams.create, {
      threadId: args.threadId,
      order: 1, // This should be calculated properly
      stepOrder: 0,
    });
    
    // Here you would integrate with your AI service
    // For now, I'll create a simple example
    const response = "This is a streaming response from the AI tutor.";
    
    // Send the response as deltas with correct format
    const delta = {
      streamId,
      start: 0,
      end: response.length,
      parts: [{
        type: "text-delta" as const,
        textDelta: response,
      }],
    };
    
    await ctx.runMutation(components.agent.streams.addDelta, delta);
    
    // Finish the stream
    await ctx.runMutation(components.agent.streams.finish, {
      streamId,
    });
    
    // Also add to session_messages for backward compatibility
    if (args.sessionId) {
      const session = await ctx.runQuery(api.functions.getSession, {
        sessionId: args.sessionId,
        includeContext: false,
      });
      
      if (session) {
        const existingMessages = await ctx.runQuery(api.functions.getSessionMessages, {
          sessionId: args.sessionId,
        });
        
        const nextTurnNo = (existingMessages?.length || 0) + 1;
        
        await ctx.runMutation(api.functions.addSessionMessage, {
          sessionId: args.sessionId,
          role: "assistant",
          text: response,
          payloadJson: {},
        });
      }
    }
    
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