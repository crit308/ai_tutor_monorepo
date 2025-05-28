/**
 * @fileoverview Core module main exports for unified Convex deployment
 * 
 * Re-exports all core functionality from the core module
 */

// Configuration and constants
export * from './config';

// Utilities and helpers
export * from './sessionManager';
export * from './utils';
export * from './migration';

// Document processing and file uploads
export * from './documentProcessor';
export * from './fileUploadActions';
export * from './fileUploadManager'; 