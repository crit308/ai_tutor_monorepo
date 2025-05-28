// convex/functions.ts - THIN re-export layer (NO LOGIC HERE)
// Just orchestrates modules, doesn't contain implementation
// This enables WebSocket server to call api.agents.planSessionFocus directly

// Core modules - export everything that exists
export * from './database/sessions';
export * from './database/folders';  
export * from './database/concepts';
export * from './database/optimization';
export * from './database/analytics';
export * from './database/whiteboard';
export * from './auth';
export * from './jobs';
export * from './core';

// Document processing functions
export { 
  getPendingEmbeddings, 
  updateEmbeddingStatus,
  processEmbeddingQueue,
  insertUploadedFileRecord as insertUploadedFile, // Alias for compatibility
  insertUploadedFileRecord,
  getSessionFiles,
  processDocumentBatch,
  analyzeDocumentContent,
  extractDocumentContent,
  getDocumentProcessingStats
} from './core/documentProcessor';

// Enhanced aliases for backward compatibility
export {
  createSession as createSessionEnhanced,
  getSession as getSessionEnhanced,
  getSessionContext as getSessionContextEnhanced,
  updateSessionContext as updateSessionContextEnhanced,
  updateSessionStatus as updateSessionStatusEnhanced,
  listUserSessions as listUserSessionsEnhanced,
  deleteSession as deleteSessionEnhanced
} from './database/sessions';

export {
  createFolder as createFolderEnhanced,
  getFolder as getFolderEnhanced,
  updateFolder as updateFolderEnhanced,
  deleteFolder as deleteFolderEnhanced,
  listFolders as listFoldersEnhanced,
  renameFolder as renameFolderEnhanced
} from './database/folders';

// File upload and processing
export {
  processUploadedFilesForSession
} from './core/fileUploadActions';

// Background job alias
export {
  createBackgroundJob as scheduleBackgroundJob
} from './jobs';

// Additional exports needed by HTTP endpoints (base names)
export {
  createSession,
  getSession,
  getSessionContext,
  updateSessionContext,
  listUserSessions,
  deleteSession,
  updateSessionStatus,
  getSessionMessages,
  logMiniQuizAttempt,
  logUserSummary,
  cleanupExpiredSessions,
  checkAuthStatus,
  getCurrentUserInfo,
  getUserSessions,
  validateSessionContext
} from './database/sessions';

export {
  createFolder,
  getFolder,
  listFolders,
  renameFolder,
  deleteFolder,
  updateFolder,
  getUserFolders,
  getFolderData,
  updateFolderVectorStore
} from './database/folders';

// Whiteboard functions
export {
  insertSnapshot,
  getWhiteboardSnapshots,
  getLatestSnapshotIndex,
  deleteSessionSnapshots
} from './database/whiteboard';

// Analytics functions
export {
  insertInteractionLog
} from './database/analytics';

// API endpoint functions
export {
  uploadSessionDocuments,
  getSessionAnalysisResults as getSessionAnalysis
} from './api/endpoints';

// WebSocket/Whiteboard actions
export {
  getBoardSummary
} from './websocket/whiteboardActions';

// Missing functions that HTTP endpoints expect - need to check if they exist
// Will add these as we find them in the modules


