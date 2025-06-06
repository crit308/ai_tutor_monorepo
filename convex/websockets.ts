import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

/**
 * WebSocket System for Convex Skills Migration (Day 10)
 * 
 * Provides real-time communication between agents and frontend
 * via Convex mutations and queries for whiteboard operations.
 */

// Store WebSocket session mappings
export const registerSession = mutation({
  args: {
    session_id: v.string(),
    user_id: v.string(),
    connection_id: v.string(),
  },
  handler: async (ctx, args) => {
    // Store the session connection info
    await ctx.db.insert("realtime_events", {
      event_type: "session_connected",
      session_id: args.session_id,
      user_id: args.user_id,
      event_data: {
        connection_id: args.connection_id,
        connected_at: Date.now()
      },
      timestamp: Date.now(),
    });
    
    return { success: true };
  },
});

// Send data to a specific session
export const sendToSession = mutation({
  args: {
    session_id: v.string(),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    // Store the message to be consumed by the frontend
    await ctx.db.insert("realtime_events", {
      event_type: "agent_message",
      session_id: args.session_id,
      event_data: args.data,
      timestamp: Date.now(),
    });

    // Also store in whiteboard_actions for persistence
    if (args.data.actions && Array.isArray(args.data.actions)) {
      for (const action of args.data.actions) {
        await ctx.db.insert("whiteboard_actions", {
          session_id: args.session_id,
          action,
          payload: args.data.payload,
          batch_id: action.batch_id || "websocket-message",
          timestamp: Date.now(),
        });
      }
    }

    return { success: true };
  },
});

// Get pending messages for a session
export const getSessionMessages = query({
  args: {
    session_id: v.string(),
    since_timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const since = args.since_timestamp || (Date.now() - 60000); // Last minute by default
    
    const messages = await ctx.db
      .query("realtime_events")
      .filter(q => q.eq(q.field("session_id"), args.session_id))
      .filter(q => q.eq(q.field("event_type"), "agent_message"))
      .filter(q => q.gte(q.field("timestamp"), since))
      .order("desc")
      .take(50);

    return messages.map(msg => ({
      id: msg._id,
      data: msg.event_data,
      timestamp: msg.timestamp,
    }));
  },
});

// Mark messages as consumed
export const markMessagesConsumed = mutation({
  args: {
    session_id: v.string(),
    message_ids: v.array(v.id("realtime_events")),
  },
  handler: async (ctx, args) => {
    // Mark messages as consumed by updating them
    for (const messageId of args.message_ids) {
      const existing = await ctx.db.get(messageId);
      if (existing && existing.session_id === args.session_id) {
        await ctx.db.patch(messageId, {
          event_data: {
            ...existing.event_data,
            consumed: true,
            consumed_at: Date.now()
          }
        });
      }
    }
    
    return { success: true };
  },
});

// Get real-time session status
export const getSessionStatus = query({
  args: {
    session_id: v.string(),
  },
  handler: async (ctx, args) => {
    // Get recent session activity
    const recentActivity = await ctx.db
      .query("realtime_events")
      .filter(q => q.eq(q.field("session_id"), args.session_id))
      .filter(q => q.gte(q.field("timestamp"), Date.now() - 300000)) // Last 5 minutes
      .order("desc")
      .take(10);

    const isActive = recentActivity.some(event => 
      event.event_type === "session_connected" || 
      event.event_type === "agent_message"
    );

    return {
      session_id: args.session_id,
      is_active: isActive,
      last_activity: recentActivity[0]?.timestamp || null,
      recent_message_count: recentActivity.filter(e => e.event_type === "agent_message").length,
    };
  },
});

// Broadcast to all sessions (for system-wide events)
export const broadcastToAllSessions = mutation({
  args: {
    event_type: v.string(),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("realtime_events", {
      event_type: args.event_type,
      event_data: args.data,
      timestamp: Date.now(),
    });
    
    return { success: true };
  },
});

// Clean up old events (for maintenance)
export const cleanupOldEvents = mutation({
  args: {
    older_than_hours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const hoursAgo = args.older_than_hours || 24; // Default 24 hours
    const cutoffTime = Date.now() - (hoursAgo * 60 * 60 * 1000);
    
    const oldEvents = await ctx.db
      .query("realtime_events")
      .filter(q => q.lt(q.field("timestamp"), cutoffTime))
      .collect();

    let deletedCount = 0;
    for (const event of oldEvents) {
      await ctx.db.delete(event._id);
      deletedCount++;
    }

    return { 
      deleted_count: deletedCount,
      cutoff_time: cutoffTime 
    };
  },
});

// Helper to send error messages via WebSocket
export const sendErrorToSession = mutation({
  args: {
    session_id: v.string(),
    error_message: v.string(),
    error_code: v.optional(v.string()),
    details: v.optional(v.any()),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const errorData = {
      payload: {
        message_text: args.error_message,
        message_type: "error",
        error_code: args.error_code,
        details: args.details,
      },
      actions: []
    };

    await ctx.runMutation(api.websockets.sendToSession, {
      session_id: args.session_id,
      data: errorData,
    });

    return { success: true };
  },
}); 