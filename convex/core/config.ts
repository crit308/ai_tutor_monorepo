/**
 * @fileoverview Core configuration for unified Convex deployment
 * 
 * Contains shared configuration, constants, and environment variables
 */

// Environment configuration
export const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  CONVEX_URL: process.env.CONVEX_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || '',
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET || '',
  WS_PORT: Number(process.env.WS_PORT || 8080),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
} as const;

// Application constants
export const CONSTANTS = {
  // Session configuration
  SESSION_TIMEOUT_MS: 24 * 60 * 60 * 1000, // 24 hours
  MAX_SESSION_CONTEXT_SIZE: 1024 * 1024, // 1MB
  
  // Rate limiting
  DEFAULT_RATE_LIMIT: 100, // requests per minute
  AUTH_RATE_LIMIT: 10, // auth requests per minute
  WS_RATE_LIMIT: 50, // WebSocket messages per minute
  
  // Database
  MAX_QUERY_LIMIT: 100,
  DEFAULT_QUERY_LIMIT: 20,
  
  // File upload
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_FILE_TYPES: ['.pdf', '.txt', '.md', '.doc', '.docx'],
  
  // WebSocket
  WS_HEARTBEAT_INTERVAL: 30000, // 30 seconds
  WS_CONNECTION_TIMEOUT: 60000, // 60 seconds
  
  // Analytics
  ANALYTICS_BATCH_SIZE: 100,
  ANALYTICS_FLUSH_INTERVAL: 5000, // 5 seconds
} as const;

// Feature flags
export const FEATURES = {
  ENABLE_ANALYTICS: true,
  ENABLE_RATE_LIMITING: true,
  ENABLE_WEBSOCKET_AUTH: true,
  ENABLE_FILE_UPLOAD: true,
  ENABLE_CONCEPT_GRAPH: true,
  ENABLE_MINI_QUIZ: true,
  ENABLE_SESSION_ANALYSIS: true,
} as const;

// Error codes
export const ERROR_CODES = {
  // Authentication
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  
  // Authorization
  ACCESS_DENIED: 'ACCESS_DENIED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Validation
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Resources
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  
  // System
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

// Type definitions for configuration
export type Environment = typeof ENV;
export type Constants = typeof CONSTANTS;
export type Features = typeof FEATURES;
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]; 