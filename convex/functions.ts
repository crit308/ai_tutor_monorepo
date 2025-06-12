// ==========================================
// CONVEX FUNCTIONS EXPORT FILE
// ==========================================
// This file exports all Convex functions to make them available via the API

// Folder management functions
export {
  createFolder,
  getFolder,
  listFolders,
  listFoldersEnhanced,
  updateFolder,
  renameFolder,
  deleteFolder,
  getFolderStats,
  getUserFolders,
  getFolderData,
  updateFolderVectorStore,
  updateKnowledgeBase,
  getFolderInternal
} from './database/folders';

// Session management functions  
export {
  createSession,
  getSession,
  getSessionContext,
  updateSessionContext,
  updateSessionStatus,
  listUserSessions,
  deleteSession,
  getSessionMessages,
  logMiniQuizAttempt,
  logUserSummary,
  cleanupExpiredSessions,
  checkAuthStatus,
  getCurrentUserInfo,
  getUserSessions,
  validateSessionContext,
  addSessionMessage,
  updateSessionMessage
} from './database/sessions';

// Whiteboard functions
export {
  insertSnapshot,
  getWhiteboardSnapshots,
  getLatestSnapshotIndex,
  deleteSessionSnapshots,
  getWhiteboardObjects,
  addWhiteboardObject,
  updateWhiteboardObject,
  deleteWhiteboardObject,
  clearWhiteboardObjects,
  getBoardSummary
} from './database/whiteboard';

// Analytics functions
export {
  logInteractionAnalytics,
  insertInteractionLog,
  logToolInvocation,
  logTokenUsage,
  updateSessionAnalytics
} from './database/analytics';

// API endpoint functions
export {
  uploadSessionDocuments,
  getSessionAnalysisResults
} from './api/endpoints';

// Agent functions
export {
  planSessionFocus,
  analyzeDocuments
} from './agents/actions';

// Streaming functions
export {
  listThreadMessages,
  sendStreamingMessage,
  getOrCreateSessionThread,
  migrateSessionToThread
} from './agents/streaming';

// Document processing functions
export {
  processDocumentBatch,
  analyzeDocumentContent,
  getSessionFiles,
  getPendingEmbeddings,
  updateEmbeddingStatus,
  insertUploadedFileRecord,
  insertUploadedFileRecord as insertUploadedFile
} from './core/documentProcessor';

// Job functions
export {
  processEmbeddingQueueBackground
} from './jobs/background';

// Concept graph functions
export {
  getAllConceptGraphEdges
} from './database/concepts';

// Debug and utility functions
export { debugAuth } from './auth';

// File management functions
export {
  generateUploadUrl,
  storeFileMetadata,
  listSessionFiles,
  getFileUrl,
  deleteFile
} from './database/files';

// OpenAI Vector Store functions
export {
  createVectorStoreAndProcessFiles,
  generateKnowledgeBase
} from './core/openAIVectorStore';

// ==========================================
// INTERNAL HELPER FUNCTIONS (used by agents)
// ==========================================
import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getSessionInternal = internalQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    return session;
  },
});

export const updateSessionContextInternal = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    context: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      context_data: args.context,
      updated_at: Date.now(),
    });
    return null;
  },
});

export const logInteractionInternal = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    userId: v.string(),
    role: v.string(),
    content: v.string(),
    contentType: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("interaction_logs", {
      session_id: args.sessionId,
      user_id: args.userId,
      role: args.role,
      content: args.content,
      content_type: args.contentType,
      timestamp: Date.now(),
      created_at: Date.now(),
    });
    return null;
  },
});


