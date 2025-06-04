/**
 * @fileoverview Authentication middleware for unified Convex deployment
 * 
 * Contains authorization middleware, rate limiting, and session validation
 */

import { ConvexError } from "convex/values";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { auth } from "../auth";

/**
 * Authorization middleware for Convex functions
 */
export async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
    console.log("=== REQUIRE AUTH CALLED ===");
    try {
        // Check if auth is available
        console.log("Auth object available:", !!auth);
        console.log("Auth getUserId function available:", typeof auth.getUserId);
        
        const userId = await auth.getUserId(ctx);
        console.log("getUserId result:", userId);
        console.log("getUserId type:", typeof userId);
        
        if (!userId) {
            console.log("No userId found, throwing auth error");
            const authError = new ConvexError('Authentication required');
            console.log("Auth error created:", authError);
            throw authError;
        }
        console.log("Auth successful, userId:", userId);
        return userId;
    } catch (error) {
        console.log("Auth error in requireAuth:", error);
        console.log("Error name:", error instanceof Error ? error.name : 'unknown');
        console.log("Error message:", error instanceof Error ? error.message : String(error));
        throw error;
    }
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
    const userId = await auth.getUserId(ctx);
    if (!userId) {
        return null;
    }
    
    // Get user info from Convex Auth's user store
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("_id"), userId))
      .first();
    
    return {
        id: userId,
        email: user?.email,
        name: user?.name,
        image: user?.image,
    };
}

/**
 * Admin authorization check
 */
export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<string> {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
        throw new ConvexError('Authentication required');
    }
    
    // Get user info from Convex Auth's user store
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("_id"), userId))
      .first();
    
    // Check for admin role (can be customized based on your admin system)
    const isAdmin = user?.email?.endsWith('@admin.com') || 
                   (user as any)?.role === 'admin' ||
                   process.env.ADMIN_EMAILS?.split(',').includes(user?.email || '');
    
    if (!isAdmin) {
        throw new ConvexError('Admin access required');
    }
    
    return userId;
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