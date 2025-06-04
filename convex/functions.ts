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
  updateKnowledgeBase
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
  createSessionThread,
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


