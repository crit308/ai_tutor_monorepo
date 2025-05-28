/**
 * @fileoverview Database module main exports for unified Convex deployment
 * 
 * Re-exports all database functionality from the database module
 */

// Database schema
export { default } from './schema';

// Session operations
export * from './sessions';

// Folder operations  
export * from './folders';

// Concept graph operations
export * from './concepts';

// Database optimization and performance
export * from './optimization'; 