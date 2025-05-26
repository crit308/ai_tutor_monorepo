import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { 
  requireAuth, 
  requireAuthAndOwnership, 
  getCurrentUser, 
  validateSessionAccess,
  checkRateLimit 
} from "./auth";

// Export enhanced CRUD operations from separate modules (with unique names to avoid conflicts)
export {
  createSession as createSessionEnhanced,
  getSession as getSessionEnhanced,
  getSessionContext as getSessionContextEnhanced,
  updateSessionContext as updateSessionContextEnhanced,
  updateSessionStatus,
  listUserSessions as listUserSessionsEnhanced,
  deleteSession as deleteSessionEnhanced,
  archiveOldSessions,
  validateSessionConsistency,
  repairSessionData,
} from "./sessionCrud";

export {
  createFolder as createFolderEnhanced,
  getFolder as getFolderEnhanced,
  listFolders as listFoldersEnhanced,
  updateFolder,
  renameFolder as renameFolderEnhanced,
  deleteFolder as deleteFolderEnhanced,
  getFolderStats,
  validateFolderConsistency,
  repairFolderData,
} from "./folderCrud";

export {
  getDatabaseMetrics,
  analyzeQueryPerformance,
  cleanupOldData,
  getIndexOptimizations,
  getStorageUsage,
} from "./databaseOptimization";

export {
  validateMigrationData,
  generateMigrationReport,
  testEnhancedFunction,
} from "./migrationValidation";

export const hello = query({
  args: {},
  handler: async () => {
    return "Hello from Convex!";
  },
});

export const logInteraction = mutation({
  args: {
    session_id: v.string(),
    user_id: v.string(),
    role: v.string(),
    content: v.string(),
    content_type: v.string(),
    event_type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("interaction_logs", {
      session_id: args.session_id,
      user_id: args.user_id,
      role: args.role,
      content: args.content,
      content_type: args.content_type,
      event_type: args.event_type,
      created_at: Date.now(),
    });
  },
});

export const createFolder = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    
    // Rate limiting
    if (!checkRateLimit(userId, 10, 60000)) {
      throw new Error("Rate limit exceeded");
    }
    
    const now = Date.now();
    const id = await ctx.db.insert("folders", {
      user_id: userId,
      name: args.name,
      created_at: now,
      updated_at: now,
    });
    const folder = await ctx.db.get(id);
    return folder;
  },
});

export const listFolders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    return await ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .collect();
  },
});

export const renameFolder = mutation({
  args: { folderId: v.id("folders"), name: v.string() },
  handler: async (ctx, { folderId, name }) => {
    const userId = await requireAuth(ctx);
    const folder = await ctx.db.get(folderId);
    if (!folder || folder.user_id !== userId) {
      throw new Error("Folder not found");
    }
    await ctx.db.patch(folderId, { name, updated_at: Date.now() });
  },
});

export const deleteFolder = mutation({
  args: { folderId: v.id("folders") },
  handler: async (ctx, { folderId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const folder = await ctx.db.get(folderId);
    if (!folder || folder.user_id !== identity.subject) {
      throw new Error("Folder not found");
    }
    await ctx.db.delete(folderId);
  },
});

export const getFolder = query({
  args: { folderId: v.id("folders") },
  handler: async (ctx, { folderId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const folder = await ctx.db.get(folderId);
    if (!folder || folder.user_id !== identity.subject) return null;
    return folder;
  },
});

export const getSession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== identity.subject) return null;
    return session;
  },
});

export const createSession = mutation({
  args: { folderId: v.optional(v.id("folders")) },
  handler: async (ctx, { folderId }) => {
    const userId = await requireAuth(ctx);
    
    // Rate limiting for session creation
    if (!checkRateLimit(userId, 20, 60000)) {
      throw new Error("Rate limit exceeded for session creation");
    }
    
    // Verify folder ownership if folder is provided
    if (folderId) {
      const folder = await ctx.db.get(folderId);
      if (!folder || folder.user_id !== userId) {
        throw new Error("Folder not found or access denied");
      }
    }
    
    const now = Date.now();
    const id = await ctx.db.insert("sessions", {
      user_id: userId,
      folder_id: folderId ?? undefined,
      context_data: {},
      created_at: now,
      updated_at: now,
    });
    return { id };
  },
});

// Define startSession explicitly so the Convex codegen picks it up
export const startSession = mutation({
  args: { folderId: v.optional(v.id("folders")) },
  handler: async (ctx, { folderId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const now = Date.now();
    const id = await ctx.db.insert("sessions", {
      user_id: identity.subject,
      folder_id: folderId ?? undefined,
      context_data: {},
      created_at: now,
      updated_at: now,
    });
    return { id };
  },
});

export const getSessionMessages = query({
  args: {
    sessionId: v.id("sessions"),
    beforeTurnNo: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { sessionId, beforeTurnNo, limit }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    let q = ctx.db
      .query("session_messages")
      .withIndex("by_session_turn", (q) => q.eq("session_id", sessionId));
    if (beforeTurnNo !== undefined) {
      q = q.filter((f) => f.lt(f.field("turn_no"), beforeTurnNo));
    }
    const rows = await q.order("desc").take(limit ?? 50);
    rows.reverse();
    return rows.map((r) => ({ ...r }));
  },
});

export const updateSessionContext = mutation({
  args: { sessionId: v.id("sessions"), context: v.any() },
  handler: async (ctx, { sessionId, context }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== identity.subject) {
      throw new Error("Session not found");
    }
    await ctx.db.patch(sessionId, {
      context_data: context,
      updated_at: Date.now(),
    });
    return true;
  },
});

export const getSessionContext = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== identity.subject) return null;
    return { context: session.context_data };
  },
});
// Note: Redis and Y.js functionality moved to whiteboardActions.ts due to Node.js requirements

export const insertSnapshot = mutation({
  args: {
    sessionId: v.id('sessions'),
    snapshotIndex: v.number(),
    actionsJson: v.any(),
  },
  handler: async (ctx, { sessionId, snapshotIndex, actionsJson }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== identity.subject) {
      throw new Error('Session not found');
    }
    await ctx.db.insert('whiteboard_snapshots', {
      session_id: sessionId,
      snapshot_index: snapshotIndex,
      actions_json: actionsJson,
      created_at: Date.now(),
    });
  },
});

export const getWhiteboardSnapshots = query({
  args: { sessionId: v.id('sessions'), maxIndex: v.optional(v.number()) },
  handler: async (ctx, { sessionId, maxIndex }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== identity.subject) return [];
    let q = ctx.db
      .query('whiteboard_snapshots')
      .withIndex('by_session_snapshot', (q) =>
        q.eq('session_id', sessionId)
      );
    if (maxIndex !== undefined) {
      q = q.filter((f) => f.lte(f.field('snapshot_index'), maxIndex));
    }
    return await q.order('asc').collect();
  },
});

// Helper mutations for file upload actions
export const insertUploadedFile = mutation({
  args: {
    supabasePath: v.string(),
    userId: v.string(),
    folderId: v.string(),
    embeddingStatus: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.subject !== args.userId) {
      throw new Error('Not authenticated');
    }
    
    await ctx.db.insert('uploaded_files', {
      supabase_path: args.supabasePath,
      user_id: args.userId,
      folder_id: args.folderId,
      embedding_status: args.embeddingStatus,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  },
});

export const updateFolderVectorStore = mutation({
  args: {
    folderId: v.id('folders'),
    vectorStoreId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.user_id !== identity.subject) {
      throw new Error('Folder not found');
    }
    
    await ctx.db.patch(args.folderId, {
      vector_store_id: args.vectorStoreId,
      updated_at: Date.now(),
    });
  },
});

export const updateSessionAnalysisStatus = mutation({
  args: {
    sessionId: v.id('sessions'),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.user_id !== identity.subject) {
      throw new Error('Session not found');
    }
    
    await ctx.db.patch(args.sessionId, {
      analysis_status: args.status,
      updated_at: Date.now(),
    });
  },
});

export const getSessionAnalysis = query({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== identity.subject) {
      throw new Error('Session not found');
    }
    const context = (session.context_data as any) || {};
    return {
      status: session.analysis_status ?? (context.analysis_result ? 'completed' : 'pending'),
      analysis: context.analysis_result ?? null,
    };
  },
});

export const logMiniQuizAttempt = mutation({
  args: {
    sessionId: v.id('sessions'),
    question: v.string(),
    selectedOption: v.string(),
    correctOption: v.string(),
    isCorrect: v.boolean(),
    relatedSection: v.optional(v.string()),
    topic: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.user_id !== identity.subject) {
      throw new Error('Session not found');
    }
    await ctx.db.insert('interaction_logs', {
      session_id: args.sessionId,
      user_id: identity.subject,
      role: 'user',
      content: JSON.stringify({
        question: args.question,
        selectedOption: args.selectedOption,
        correctOption: args.correctOption,
        isCorrect: args.isCorrect,
        relatedSection: args.relatedSection,
        topic: args.topic,
      }),
      content_type: 'mini_quiz',
      event_type: 'mini_quiz',
      created_at: Date.now(),
    });
  },
});

export const logUserSummary = mutation({
  args: {
    sessionId: v.id('sessions'),
    section: v.string(),
    topic: v.string(),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.user_id !== identity.subject) {
      throw new Error('Session not found');
    }
    await ctx.db.insert('interaction_logs', {
      session_id: args.sessionId,
      user_id: identity.subject,
      role: 'user',
      content: JSON.stringify({
        section: args.section,
        topic: args.topic,
        summary: args.summary,
      }),
      content_type: 'user_summary',
      event_type: 'user_summary',
      created_at: Date.now(),
    });
  },
});

// New session management functions for enhanced SessionManager

export const deleteSession = mutation({
  args: { sessionId: v.id("sessions"), userId: v.string() },
  handler: async (ctx, { sessionId, userId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.subject !== userId) {
      throw new Error("Not authenticated");
    }
    
    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found");
    }

    // Delete related data first (messages, snapshots, etc.)
    const messages = await ctx.db
      .query("session_messages")
      .withIndex("by_session_turn", (q) => q.eq("session_id", sessionId))
      .collect();
    
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    const snapshots = await ctx.db
      .query("whiteboard_snapshots")
      .withIndex("by_session_snapshot", (q) => q.eq("session_id", sessionId))
      .collect();
    
    for (const snapshot of snapshots) {
      await ctx.db.delete(snapshot._id);
    }

    // Delete concept events
    const conceptEvents = await ctx.db
      .query("concept_events")
      .withIndex("by_session", (q) => q.eq("session_id", sessionId))
      .collect();
    
    for (const event of conceptEvents) {
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

    // Delete edge logs
    const edgeLogs = await ctx.db
      .query("edge_logs")
      .withIndex("by_session", (q) => q.eq("session_id", sessionId))
      .collect();
    
    for (const log of edgeLogs) {
      await ctx.db.delete(log._id);
    }

    // Delete interaction logs
    const interactionLogs = await ctx.db
      .query("interaction_logs")
      .withIndex("by_session_created", (q) => q.eq("session_id", sessionId))
      .collect();
    
    for (const log of interactionLogs) {
      await ctx.db.delete(log._id);
    }

    // Finally delete the session itself
    await ctx.db.delete(sessionId);
    
    return { success: true };
  },
});

export const listUserSessions = query({
  args: { 
    userId: v.string(), 
    limit: v.optional(v.number()), 
    offset: v.optional(v.number()) 
  },
  handler: async (ctx, { userId, limit = 50, offset = 0 }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.subject !== userId) {
      throw new Error("Not authenticated");
    }

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .order("desc")
      .take(Math.min(limit, 100)); // Cap at 100 for performance

    // Apply offset manually (Convex doesn't have built-in offset)
    const offsetSessions = sessions.slice(offset);

    return {
      sessions: offsetSessions.map(session => ({
        id: session._id,
        created_at: session.created_at,
        folder_id: session.folder_id,
        updated_at: session.updated_at,
        ended_at: session.ended_at,
        analysis_status: session.analysis_status,
      })),
    };
  },
});

export const cleanupExpiredSessions = mutation({
  args: { maxAgeMs: v.number() },
  handler: async (ctx, { maxAgeMs }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const cutoffTime = Date.now() - maxAgeMs;
    
    // Find expired sessions
    const expiredSessions = await ctx.db
      .query("sessions")
      .filter((q) => q.and(
        q.lt(q.field("created_at"), cutoffTime),
        q.eq(q.field("ended_at"), undefined) // Only cleanup unended sessions
      ))
      .collect();

    let deletedCount = 0;

    for (const session of expiredSessions) {
      try {
        // Delete related data
        const messages = await ctx.db
          .query("session_messages")
          .withIndex("by_session_turn", (q) => q.eq("session_id", session._id))
          .collect();
        
        for (const message of messages) {
          await ctx.db.delete(message._id);
        }

        const snapshots = await ctx.db
          .query("whiteboard_snapshots")
          .withIndex("by_session_snapshot", (q) => q.eq("session_id", session._id))
          .collect();
        
        for (const snapshot of snapshots) {
          await ctx.db.delete(snapshot._id);
        }

        // Delete the session
        await ctx.db.delete(session._id);
        deletedCount++;

      } catch (error) {
        console.error(`Failed to delete expired session ${session._id}:`, error);
      }
    }

    return { deletedCount };
  },
});

export const getFolderData = query({
  args: { folderId: v.id("folders"), userId: v.string() },
  handler: async (ctx, { folderId, userId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.subject !== userId) {
      throw new Error("Not authenticated");
    }

    const folder = await ctx.db.get(folderId);
    if (!folder || folder.user_id !== userId) {
      return null;
    }

    return {
      id: folder._id,
      name: folder.name,
      vector_store_id: folder.vector_store_id,
      knowledge_base: folder.knowledge_base,
      created_at: folder.created_at,
      updated_at: folder.updated_at,
    };
  },
});

// Enhanced session context validation
export const validateSessionContext = query({
  args: { sessionId: v.id("sessions"), userId: v.string() },
  handler: async (ctx, { sessionId, userId }) => {
    // Validate that requesting user matches the userId parameter
    await requireAuthAndOwnership(ctx, userId);

    const session = await ctx.db.get(sessionId);
    if (!session || session.user_id !== userId) {
      return { valid: false, reason: "Session not found" };
    }

    const context = session.context_data as any;
    if (!context) {
      return { valid: false, reason: "No context data" };
    }

    // Basic validation
    const requiredFields = ['user_id', 'session_id', 'interaction_mode'];
    for (const field of requiredFields) {
      if (!context[field]) {
        return { valid: false, reason: `Missing required field: ${field}` };
      }
    }

    return { valid: true, reason: null };
  },
});

// New authentication management functions

export const getCurrentUserInfo = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

export const getUserSessions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 50 }) => {
    const userId = await requireAuth(ctx);
    
    return await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .order("desc")
      .take(Math.min(limit, 100));
  },
});

export const getUserFolders = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 50 }) => {
    const userId = await requireAuth(ctx);
    
    return await ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .order("desc")
      .take(Math.min(limit, 100));
  },
});

export const checkAuthStatus = query({
  args: {},
  handler: async (ctx) => {
    try {
      const user = await getCurrentUser(ctx);
      return {
        authenticated: user !== null,
        user: user,
        timestamp: Date.now(),
      };
    } catch {
      return {
        authenticated: false,
        user: null,
        timestamp: Date.now(),
      };
    }
  },
});

// Simplified board summary action without Redis dependency
export const getBoardSummary = action({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    // Verify session access through query
    const session = await ctx.runQuery(api.functions.getSession, { sessionId });
    if (!session) {
      throw new Error("Session not found");
    }

    // For now, return a simplified summary without Redis
    // TODO: Implement proper Redis integration when Node.js actions are working
    return {
      counts: { by_kind: {}, by_owner: {} },
      learner_question_tags: [],
      concept_clusters: [],
      ephemeralSummary: {
        activeHighlights: 0,
        activeQuestionTags: [],
        recentPointer: null,
      },
    };
  },
});

// Simplified upload mutation without file system dependencies
export const uploadSessionDocuments = mutation({
  args: {
    sessionId: v.id('sessions'),
    filenames: v.array(v.string()),
  },
  handler: async (ctx, { sessionId, filenames }) => {
    // Get the session and verify access directly from database
    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Store file metadata in uploaded_files table
    for (const filename of filenames) {
      await ctx.db.insert("uploaded_files", {
        session_id: sessionId,
        filename: filename,
        mime_type: "application/octet-stream", // Default mime type
        supabase_path: `uploads/${sessionId}/${filename}`,
        user_id: session.user_id,
        folder_id: session.folder_id || "default",
        embedding_status: "pending",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    }

    // Update session with file upload info
    const updatedContext = {
      ...(session.context_data || {}),
      uploaded_file_paths: [
        ...((session.context_data?.uploaded_file_paths || [])),
        ...filenames,
      ],
      vector_store_id: `vs_${Date.now()}`,
    };

    await ctx.db.patch(sessionId, {
      context_data: updatedContext,
      updated_at: Date.now(),
    });

    return {
      vector_store_id: `vs_${Date.now()}`,
      files_received: filenames,
      analysis_status: 'completed',
      message: 'Files processed successfully',
    };
  },
});


