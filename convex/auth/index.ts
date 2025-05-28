/**
 * @fileoverview Authentication module main exports for unified Convex deployment
 * 
 * Re-exports all authentication functionality from the auth module
 */

// Configuration and JWT handling
export * from './config';

// Middleware and authorization
export * from './middleware';

// WebSocket authentication
export * from './websocket'; 