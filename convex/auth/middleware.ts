/**
 * @fileoverview Authentication middleware for unified Convex deployment
 * 
 * Contains authorization middleware, rate limiting, and session validation
 */

import { ConvexError } from "convex/values";
import { QueryCtx, MutationCtx } from "../_generated/server";

/**
 * Authorization middleware for Convex functions
 */
export async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
        throw new ConvexError('Authentication required');
    }
    return identity.subject;
}

/**
 * Authorization middleware with user ownership verification
 */
export async function requireAuthAndOwnership(
    ctx: QueryCtx | MutationCtx,
    resourceUserId: string
): Promise<string> {
    const userId = await requireAuth(ctx);
    if (userId !== resourceUserId) {
        throw new ConvexError('Access denied: insufficient permissions');
    }
    return userId;
}

/**
 * Get current authenticated user information
 */
export async function getCurrentUser(ctx: QueryCtx | MutationCtx): Promise<{
    id: string;
    email?: string;
    name?: string;
    image?: string;
} | null> {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
        return null;
    }
    
    return {
        id: identity.subject,
        email: identity.email,
        name: identity.name,
        image: identity.pictureUrl,
    };
}

/**
 * Admin authorization check
 */
export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<string> {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
        throw new ConvexError('Authentication required');
    }
    
    // Check for admin role (can be customized based on your admin system)
    const isAdmin = identity.email?.endsWith('@admin.com') || 
                   (identity as any).role === 'admin' ||
                   process.env.ADMIN_EMAILS?.split(',').includes(identity.email || '');
    
    if (!isAdmin) {
        throw new ConvexError('Admin access required');
    }
    
    return identity.subject;
}

/**
 * Rate limiting helper (basic implementation)
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
    userId: string, 
    maxRequests: number = 100, 
    windowMs: number = 60000
): boolean {
    const now = Date.now();
    const key = `rate_limit:${userId}`;
    const current = rateLimitStore.get(key);
    
    if (!current || now > current.resetTime) {
        rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
        return true;
    }
    
    if (current.count >= maxRequests) {
        return false;
    }
    
    current.count++;
    return true;
}

/**
 * Session validation helper
 */
export async function validateSessionAccess(
    ctx: QueryCtx | MutationCtx,
    sessionId: string
): Promise<string> {
    const userId = await requireAuth(ctx);
    
    // Get session and verify ownership
    const session = await ctx.db.get(sessionId as any);
    if (!session) {
        throw new ConvexError('Session not found');
    }
    
    // Type guard to ensure we have a session document
    if ('user_id' in session && session.user_id !== userId) {
        throw new ConvexError('Access denied: session does not belong to user');
    }
    
    return userId;
} 