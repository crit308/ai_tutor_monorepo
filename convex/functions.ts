// convex/functions.ts - THIN re-export layer (NO LOGIC HERE)
// Just orchestrates modules, doesn't contain implementation

// Database operations
export * from './database/sessions';
export * from './database/folders';
export * from './database/concepts';
export * from './database/optimization';
export * from './database/analytics';

// Authentication
export * from './auth';

// AI Agents
export * from './agents/actions';

// Background jobs
export * from './jobs';

// Core utilities
export * from './core';

// API endpoints (if needed for function exports)
// Note: HTTP endpoints are handled separately via http.ts


