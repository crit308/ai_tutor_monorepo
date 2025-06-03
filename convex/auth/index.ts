/**
 * @fileoverview Authentication module main exports for unified Convex deployment
 * 
 * Re-exports utilities and middleware for authentication.
 * The main `convexAuth` instance (including `signIn`, `auth`, etc.) is defined 
 * and exported from `convex/auth.ts`.
 */

// Middleware and authorization helpers (from ./middleware.ts)
export * from './middleware'; 