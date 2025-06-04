import { query, mutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { 
  requireAuth, 
  requireAuthAndOwnership,
  checkRateLimit,
  getCurrentUser 
} from "../auth/middleware";
import { auth } from "../auth";

// ==========================================
// SESSION CRUD OPERATIONS
// ==========================================

/**
 * Create a new session with proper validation and context initialization
 */
export const createSession = mutation({
  args: { 
    folderId: v.optional(v.id("folders")),
    initialContext: v.optional(v.any()),
    metadata: v.optional(v.object({
      clientVersion: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      timezone: v.optional(v.string()),
    }))
  },
  handler: async (ctx, { folderId, initialContext, metadata }) => {
    console.log("=== CREATE SESSION CALLED ===");
    console.log("Args:", { folderId, initialContext: !!initialContext, metadata });
    
    // Enhanced authentication with retry logic
    let userId: string;
    try {
      userId = await requireAuth(ctx);
      console.log("Auth successful in createSession, userId:", userId);
    } catch (authError) {
      console.error("Auth failed in createSession:", authError);
      
      // Try direct auth call as fallback
      try {
        console.log("Attempting direct auth call...");
        const directUserId = await auth.getUserId(ctx);
        console.log("Direct auth result:", directUserId, "type:", typeof directUserId);
        
        if (directUserId) {
          userId = directUserId;
          console.log("Direct auth succeeded, userId:", userId);
        } else {
          console.error("Direct auth also returned null");
          throw new ConvexError("Authentication failed - no user session found");
        }
      } catch (directAuthError) {
        console.error("Direct auth also failed:", directAuthError);
        throw new ConvexError("Authentication required - please refresh the page and try again");
      }
    }
    
    // Rate limiting for session creation
    if (!checkRateLimit(userId, 20, 60000)) {
      throw new Error("Rate limit exceeded for session creation");
    }
    
    // Verify folder ownership if folder is provided
    let folderData = null;
    if (folderId) {
      console.log("Verifying folder ownership for:", folderId);
      folderData = await ctx.db.get(folderId);
      if (!folderData) {
        console.error("Folder not found:", folderId);
        throw new Error("Folder not found");
      }
      if (folderData.user_id !== userId) {
        console.error("Folder access denied. Folder user_id:", folderData.user_id, "Auth userId:", userId);
        throw new Error("Folder access denied");
      }
      console.log("Folder ownership verified");
    }
    
    const now = Date.now();
    
    // Initialize default context with proper structure
    const defaultContext = {
      session_id: "", // Will be set after creation
      user_id: userId,
      folder_id: folderId || null,
      vector_store_id: folderData?.vector_store_id || null,
      analysis_result: null,
      user_model_state: {
        mastery_levels: {},
        learning_objectives: [],
        current_focus: null,
        session_count: 0,
        total_study_time: 0,
      },
      conversation_history: [],
      recent_uploads: [],
      tool_usage_stats: {},
      created_at: now,
      ...metadata
    };
    
    const contextData = { ...defaultContext, ...initialContext };
    
    console.log("Creating session with userId:", userId, "folderId:", folderId);
    
    try {
      // Create the session
      const sessionId = await ctx.db.insert("sessions", {
        user_id: userId,
        folder_id: folderId,
        context_data: contextData,
        created_at: now,
        updated_at: now,
        analysis_status: undefined,
      });
      
      console.log("Session created successfully:", sessionId);
      
      // Update context with session_id
      contextData.session_id = sessionId;
      await ctx.db.patch(sessionId, {
        context_data: contextData,
      });
      
      // Update folder's last_session_created if folder exists
      if (folderId && folderData) {
        await ctx.db.patch(folderId, {
          updated_at: now,
        });
      }
      
      console.log("Session setup completed:", sessionId);
      
      return { 
        id: sessionId,
        folder_id: folderId,
        created_at: now 
      };
    } catch (dbError) {
      console.error("Database error during session creation:", dbError);
      throw new Error(`Failed to create session: ${dbError instanceof Error ? dbError.message : 'Unknown database error'}`);
    }
  },
});

/**
 * Get session with full context and validation
 */
export const getSession = query({
  args: { 
    sessionId: v.id("sessions"),
    includeContext: v.optional(v.boolean()),
  },
  handler: async (ctx, { sessionId, includeContext = true }) => {
    const userId = await requireAuth(ctx);
    
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      return null;
    }
    
    const result = {
      _id: session._id,
      user_id: session.user_id,
      folder_id: session.folder_id,
      created_at: session.created_at,
      updated_at: session.updated_at,
      ended_at: session.ended_at,
      analysis_status: session.analysis_status,
      context_data: includeContext ? session.context_data : undefined,
    };
    
    return result;
  },
});

/**
 * Get session context only (optimized for frequent calls)
 */
export const getSessionContext = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const userId = await requireAuth(ctx);
    
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      return null;
    }
    
    return { 
      context: session.context_data,
      updated_at: session.updated_at 
    };
  },
});

/**
 * Update session context with optimistic concurrency control
 */
export const updateSessionContext = mutation({
  args: { 
    sessionId: v.id("sessions"), 
    context: v.any(),
    expectedVersion: v.optional(v.number()), // For optimistic concurrency
    merge: v.optional(v.boolean()), // Whether to merge or replace
  },
  handler: async (ctx, { sessionId, context, expectedVersion, merge = true }) => {
    const userId = await requireAuth(ctx);
    
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    // Optimistic concurrency check
    if (expectedVersion !== undefined && session.updated_at !== expectedVersion) {
      throw new Error("Session was modified by another process. Please refresh and try again.");
    }
    
    const now = Date.now();
    let newContext = context;
    
    if (merge && session.context_data) {
      // Merge contexts, preserving structure
      newContext = {
        ...session.context_data,
        ...context,
        user_model_state: {
          ...session.context_data.user_model_state,
          ...context.user_model_state,
        },
        updated_at: now,
      };
    } else {
      // Ensure required fields exist
      newContext = {
        session_id: sessionId,
        user_id: userId,
        ...context,
        updated_at: now,
      };
    }
    
    await ctx.db.patch(sessionId, {
      context_data: newContext,
      updated_at: now,
    });
    
    return { 
      success: true, 
      updated_at: now 
    };
  },
});

/**
 * Update session status and metadata
 */
export const updateSessionStatus = mutation({
  args: {
    sessionId: v.id("sessions"),
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("archived")
    )),
    analysisStatus: v.optional(v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("success"),
      v.literal("failed")
    )),
    endSession: v.optional(v.boolean()),
  },
  handler: async (ctx, { sessionId, status, analysisStatus, endSession }) => {
    const userId = await requireAuth(ctx);
    
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    const now = Date.now();
    const updates: any = {
      updated_at: now,
    };
    
    if (analysisStatus !== undefined) {
      updates.analysis_status = analysisStatus;
    }
    
    if (endSession) {
      updates.ended_at = now;
    }
    
    await ctx.db.patch(sessionId, updates);
    
    return { success: true };
  },
});

/**
 * List user sessions with pagination and filtering
 */
export const listUserSessions = query({
  args: {
    folderId: v.optional(v.id("folders")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    includeEnded: v.optional(v.boolean()),
    sortBy: v.optional(v.union(
      v.literal("created_at"),
      v.literal("updated_at")
    )),
    sortOrder: v.optional(v.union(
      v.literal("asc"),
      v.literal("desc")
    )),
  },
  handler: async (ctx, { 
    folderId, 
    limit = 50, 
    cursor,
    includeEnded = true,
    sortBy = "updated_at",
    sortOrder = "desc"
  }) => {
    const userId = await requireAuth(ctx);
    
    let query = ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("user_id", userId));
    
    // Filter by folder if specified
    if (folderId) {
      query = query.filter((q) => q.eq(q.field("folder_id"), folderId));
    }
    
    // Filter ended sessions if needed
    if (!includeEnded) {
      query = query.filter((q) => q.eq(q.field("ended_at"), undefined));
    }
    
    // Apply sorting
    const results = await query
      .order(sortOrder === "desc" ? "desc" : "asc")
      .take(limit);
    
    return {
      sessions: results.map(session => ({
        _id: session._id,
        folder_id: session.folder_id,
        created_at: session.created_at,
        updated_at: session.updated_at,
        ended_at: session.ended_at,
        analysis_status: session.analysis_status,
        // Don't include context_data in list view for performance
      })),
      hasMore: results.length === limit,
    };
  },
});

/**
 * Delete session with cleanup
 */
export const deleteSession = mutation({
  args: { 
    sessionId: v.id("sessions"),
    deleteRelatedData: v.optional(v.boolean()),
  },
  handler: async (ctx, { sessionId, deleteRelatedData = true }) => {
    const userId = await requireAuth(ctx);
    
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    if (deleteRelatedData) {
      // Delete related session messages
      const messages = await ctx.db
        .query("session_messages")
        .withIndex("by_session_created", (q) => q.eq("session_id", sessionId))
        .collect();
      
      for (const message of messages) {
        await ctx.db.delete(message._id);
      }
      
      // Delete whiteboard snapshots
      const snapshots = await ctx.db
        .query("whiteboard_snapshots")
        .withIndex("by_session_created", (q) => q.eq("session_id", sessionId))
        .collect();
      
      for (const snapshot of snapshots) {
        await ctx.db.delete(snapshot._id);
      }
      
      // Delete concept events
      const events = await ctx.db
        .query("concept_events")
        .withIndex("by_session", (q) => q.eq("session_id", sessionId))
        .collect();
      
      for (const event of events) {
        await ctx.db.delete(event._id);
      }
      
      // Delete actions
      const actions = await ctx.db
        .query("actions")
        .withIndex("by_session", (q) => q.eq("session_id", sessionId))
        .collect();
      
      for (const action of actions) {
        await ctx.db.delete(action._id);
      }
      
      // Delete interaction logs
      const interactions = await ctx.db
        .query("interaction_logs")
        .withIndex("by_session_created", (q) => q.eq("session_id", sessionId))
        .collect();
      
      for (const interaction of interactions) {
        await ctx.db.delete(interaction._id);
      }
      
      // Delete edge logs
      const edgeLogs = await ctx.db
        .query("edge_logs")
        .withIndex("by_session", (q) => q.eq("session_id", sessionId))
        .collect();
      
      for (const log of edgeLogs) {
        await ctx.db.delete(log._id);
      }
    }
    
    // Finally delete the session
    await ctx.db.delete(sessionId);
    
    return { success: true };
  },
});

/**
 * Archive old sessions (soft delete with cleanup)
 */
export const archiveOldSessions = mutation({
  args: {
    olderThanDays: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { olderThanDays, limit = 100 }) => {
    const userId = await requireAuth(ctx);
    
    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    
    const oldSessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .filter((q) => q.lt(q.field("updated_at"), cutoffTime))
      .take(limit);
    
    let archivedCount = 0;
    
    for (const session of oldSessions) {
      // Mark as archived in analysis_status
      await ctx.db.patch(session._id, {
        analysis_status: "archived",
        ended_at: session.ended_at || Date.now(),
        updated_at: Date.now(),
      });
      archivedCount++;
    }
    
    return { 
      archivedCount,
      hasMore: oldSessions.length === limit 
    };
  },
});

// ==========================================
// SESSION DATA CONSISTENCY CHECKS
// ==========================================

/**
 * Validate session data consistency
 */
export const validateSessionConsistency = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const userId = await requireAuth(ctx);
    
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    const issues = [];
    
    // Check if folder exists if folder_id is set
    if (session.folder_id) {
      const folder = await ctx.db.get(session.folder_id as Id<"folders">);
      if (!folder) {
        issues.push("Referenced folder does not exist");
      } else if (folder.user_id !== userId) {
        issues.push("Referenced folder belongs to different user");
      }
    }
    
    // Validate context data structure
    if (session.context_data) {
      const context = session.context_data;
      
      if (!context.session_id || context.session_id !== sessionId) {
        issues.push("Context session_id mismatch");
      }
      
      if (!context.user_id || context.user_id !== userId) {
        issues.push("Context user_id mismatch");
      }
      
      if (session.folder_id && context.folder_id !== session.folder_id) {
        issues.push("Context folder_id mismatch");
      }
    } else {
      issues.push("Missing context data");
    }
    
    // Check for orphaned related data
    const messageCount = await ctx.db
      .query("session_messages")
      .withIndex("by_session_created", (q) => q.eq("session_id", sessionId))
      .collect()
      .then(results => results.length);
    
    const snapshotCount = await ctx.db
      .query("whiteboard_snapshots")
      .withIndex("by_session_created", (q) => q.eq("session_id", sessionId))
      .collect()
      .then(results => results.length);
    
    return {
      valid: issues.length === 0,
      issues,
      metadata: {
        messageCount,
        snapshotCount,
        hasFolder: !!session.folder_id,
        isEnded: !!session.ended_at,
        analysisStatus: session.analysis_status,
      }
    };
  },
});

/**
 * Repair session data inconsistencies
 */
export const repairSessionData = mutation({
  args: { 
    sessionId: v.id("sessions"),
    fixes: v.array(v.string()),
  },
  handler: async (ctx, { sessionId, fixes }) => {
    const userId = await requireAuth(ctx);
    
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    const applied = [];
    const now = Date.now();
    
    for (const fix of fixes) {
      switch (fix) {
        case "fix_context_session_id":
          if (session.context_data) {
            await ctx.db.patch(sessionId, {
              context_data: {
                ...session.context_data,
                session_id: sessionId,
              },
              updated_at: now,
            });
            applied.push(fix);
          }
          break;
          
        case "fix_context_user_id":
          if (session.context_data) {
            await ctx.db.patch(sessionId, {
              context_data: {
                ...session.context_data,
                user_id: userId,
              },
              updated_at: now,
            });
            applied.push(fix);
          }
          break;
          
        case "remove_invalid_folder_reference":
          if (session.folder_id) {
            const folder = await ctx.db.get(session.folder_id as Id<"folders">);
            if (!folder || folder.user_id !== userId) {
              await ctx.db.patch(sessionId, {
                folder_id: undefined,
                context_data: session.context_data ? {
                  ...session.context_data,
                  folder_id: null,
                } : session.context_data,
                updated_at: now,
              });
              applied.push(fix);
            }
          }
          break;
          
        case "initialize_missing_context":
          if (!session.context_data) {
            await ctx.db.patch(sessionId, {
              context_data: {
                session_id: sessionId,
                user_id: userId,
                folder_id: session.folder_id || null,
                user_model_state: {
                  mastery_levels: {},
                  learning_objectives: [],
                  current_focus: null,
                  session_count: 0,
                  total_study_time: 0,
                },
                conversation_history: [],
                recent_uploads: [],
                tool_usage_stats: {},
                created_at: session.created_at,
                updated_at: now,
              },
              updated_at: now,
            });
            applied.push(fix);
          }
          break;
      }
    }
    
    return { 
      success: true, 
      appliedFixes: applied 
    };
  },
});

// ==========================================
// SESSION MESSAGES AND INTERACTION LOGS
// ==========================================

/**
 * Get session messages/interaction logs
 */
export const getSessionMessages = query({
  args: { 
    sessionId: v.id("sessions"),
    beforeTurnNo: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { sessionId, beforeTurnNo, limit = 50 }) => {
    const userId = await requireAuth(ctx);
    
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    let query = ctx.db
      .query("session_messages")
      .withIndex("by_session_created", (q) => q.eq("session_id", sessionId));
    
    if (beforeTurnNo !== undefined) {
      query = query.filter((q) => q.lt(q.field("turn_no"), beforeTurnNo));
    }
    
    const messages = await query
      .order("desc")
      .take(limit);
    
    return messages.reverse(); // Return in chronological order
  },
});

/**
 * Log mini-quiz attempt
 */
export const logMiniQuizAttempt = mutation({
  args: {
    sessionId: v.id("sessions"),
    question: v.string(),
    selectedOption: v.string(),
    correctOption: v.string(),
    isCorrect: v.boolean(),
    relatedSection: v.optional(v.string()),
    topic: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    await ctx.db.insert("interaction_logs", {
      session_id: args.sessionId,
      user_id: userId,
      role: "user",
      content: `Quiz: ${args.question} | Selected: ${args.selectedOption} | Correct: ${args.isCorrect}`,
      content_type: "quiz_attempt",
      interaction_type: "mini_quiz_attempt",
      timestamp: Date.now(),
      created_at: Date.now(),
    });
    
    return { success: true };
  },
});

/**
 * Log user summary
 */
export const logUserSummary = mutation({
  args: {
    sessionId: v.id("sessions"),
    section: v.string(),
    topic: v.string(),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    await ctx.db.insert("interaction_logs", {
      session_id: args.sessionId,
      user_id: userId,
      role: "user",
      content: `Summary for ${args.section} - ${args.topic}: ${args.summary}`,
      content_type: "user_summary",
      interaction_type: "summary_submission",
      timestamp: Date.now(),
      created_at: Date.now(),
    });
    
    return { success: true };
  },
});

/**
 * Cleanup expired sessions
 */
export const cleanupExpiredSessions = mutation({
  args: {
    olderThanDays: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { olderThanDays = 30, limit = 100 }) => {
    // Note: This is a system operation, but we still need some auth
    // In production, this would be called by a cron job or admin
    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    
    const expiredSessions = await ctx.db
      .query("sessions")
      .filter((q) => q.and(
        q.lt(q.field("created_at"), cutoffTime),
        q.or(
          q.eq(q.field("analysis_status"), "ended"),
          q.eq(q.field("analysis_status"), "archived")
        )
      ))
      .take(limit);
    
    let deletedCount = 0;
    
    for (const session of expiredSessions) {
      // Delete related data first
      const messages = await ctx.db
        .query("session_messages")
        .withIndex("by_session_created", (q) => q.eq("session_id", session._id))
        .collect();
      
      for (const message of messages) {
        await ctx.db.delete(message._id);
      }
      
      // Delete the session
      await ctx.db.delete(session._id);
      deletedCount++;
    }
    
    return { 
      deletedCount,
      hasMore: expiredSessions.length === limit 
    };
  },
});

/**
 * Check authentication status
 */
export const checkAuthStatus = query({
  args: {},
  handler: async (ctx) => {
    try {
      const userId = await requireAuth(ctx);
      return { authenticated: true, userId };
    } catch {
      return { authenticated: false, userId: null };
    }
  },
});

/**
 * Get current user info
 */
export const getCurrentUserInfo = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("_id"), userId))
      .first();
    
    if (!user) {
      throw new Error("User not found");
    }
    
    return {
      id: user._id,
      email: user.email,
      name: user.name,
      created_at: user._creationTime,
    };
  },
});

/**
 * Get user sessions
 */
export const getUserSessions = query({
  args: {
    limit: v.optional(v.number()),
    includeEnded: v.optional(v.boolean()),
  },
  handler: async (ctx, { limit = 50, includeEnded = true }) => {
    const userId = await requireAuth(ctx);
    
    let query = ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("user_id", userId));
    
    if (!includeEnded) {
      query = query.filter((q) => q.eq(q.field("ended_at"), undefined));
    }
    
    const sessions = await query
      .order("desc")
      .take(limit);
    
    return sessions;
  },
});

/**
 * Validate session context
 */
export const validateSessionContext = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const userId = await requireAuth(ctx);
    
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      return { valid: false, error: "Session not found or access denied" };
    }
    
    if (!session.context_data) {
      return { valid: false, error: "Missing context data" };
    }
    
    const context = session.context_data;
    
    // Basic validation checks
    const checks = {
      hasSessionId: !!context.session_id,
      hasUserId: !!context.user_id,
      sessionIdMatches: context.session_id === sessionId,
      userIdMatches: context.user_id === userId,
      hasUserModelState: !!context.user_model_state,
    };
    
    const allValid = Object.values(checks).every(check => check);
    
    return {
      valid: allValid,
      checks,
      context: context,
    };
  },
});

/**
 * Add a message to a session
 */
export const addSessionMessage = mutation({
  args: {
    sessionId: v.id("sessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
    payloadJson: v.optional(v.any()),
  },
  handler: async (ctx, { sessionId, role, text, payloadJson }) => {
    const userId = await requireAuth(ctx);
    
    // Verify session ownership
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    // Get the next turn number
    const existingMessages = await ctx.db
      .query("session_messages")
      .withIndex("by_session_created", (q) => q.eq("session_id", sessionId))
      .collect();
    
    const nextTurnNo = existingMessages.length + 1;
    
    // Insert the message
    const messageId = await ctx.db.insert("session_messages", {
      session_id: sessionId,
      role,
      text,
      payload_json: payloadJson || {},
      turn_no: nextTurnNo,
      created_at: Date.now(),
    });
    
    return { id: messageId };
  },
});

/**
 * Update an existing session message
 */
export const updateSessionMessage = mutation({
  args: {
    messageId: v.id("session_messages"),
    text: v.optional(v.string()),
    payloadJson: v.optional(v.any()),
  },
  handler: async (ctx, { messageId, text, payloadJson }) => {
    const userId = await requireAuth(ctx);
    
    // Get the message and verify ownership
    const message = await ctx.db.get(messageId);
    if (!message) {
      throw new Error("Message not found");
    }
    
    // Verify session ownership
    const session = await ctx.db.get(message.session_id as Id<'sessions'>);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found or access denied");
    }
    
    // Update the message
    const updates: any = {};
    if (text !== undefined) {
      updates.text = text;
    }
    if (payloadJson !== undefined) {
      updates.payload_json = payloadJson;
    }
    
    await ctx.db.patch(messageId, updates);
    
    return { success: true };
  },
});

// ==========================================
// INTERNAL FUNCTIONS (for use by other Convex functions)
// ==========================================

/**
 * Internal getSession function (no auth required)
 */
export const getSessionInternal = internalQuery({
  args: { 
    sessionId: v.id("sessions"),
    includeContext: v.optional(v.boolean()),
  },
  handler: async (ctx, { sessionId, includeContext = true }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) {
      return null;
    }
    
    const result = {
      _id: session._id,
      user_id: session.user_id,
      folder_id: session.folder_id,
      created_at: session.created_at,
      updated_at: session.updated_at,
      ended_at: session.ended_at,
      analysis_status: session.analysis_status,
      context_data: includeContext ? session.context_data : undefined,
    };
    
    return result;
  },
}); 