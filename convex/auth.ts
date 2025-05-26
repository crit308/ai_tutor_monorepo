/**
 * @fileoverview Enhanced Authentication system for Convex migration
 * 
 * Provides comprehensive JWT verification, user authentication services,
 * and authorization middleware for migrating from Python/Supabase auth.
 */

import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import * as jose from 'jose';
import { ConvexError } from "convex/values";
import { QueryCtx, MutationCtx } from "./_generated/server";

// Export auth configuration with Password provider
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});

// JWT configuration with fallback support for Supabase migration
const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || '';
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';

/**
 * Enhanced JWT verification with support for both Convex and Supabase tokens
 */
export async function verifyJWT(token: string): Promise<jose.JWTPayload> {
    if (!JWT_SECRET) {
        throw new Error('JWT_SECRET not configured');
    }

    try {
        // Try Convex JWT format first
        const secret = new TextEncoder().encode(JWT_SECRET);
        const { payload } = await jose.jwtVerify(token, secret);
        return payload;
    } catch (convexError) {
        // Fallback to Supabase JWT for migration compatibility
        if (SUPABASE_JWT_SECRET && SUPABASE_JWT_SECRET !== JWT_SECRET) {
            try {
                const supabaseSecret = new TextEncoder().encode(SUPABASE_JWT_SECRET);
                const { payload } = await jose.jwtVerify(token, supabaseSecret);
                return payload;
            } catch (supabaseError) {
                throw new Error(`JWT verification failed: ${convexError}`);
            }
        }
        throw new Error(`JWT verification failed: ${convexError}`);
    }
}

/**
 * Extract user ID from JWT payload with multiple format support
 */
export function getUserIdFromPayload(payload: jose.JWTPayload): string {
    // Try different user ID fields for compatibility
    const userId = payload.sub || (payload as any).user_id || (payload as any).id || (payload as any).tokenData?.sub;
    if (!userId) {
        throw new Error('No user ID found in JWT payload');
    }
    return userId as string;
}

/**
 * Extract user metadata from JWT payload
 */
export function getUserMetadataFromPayload(payload: jose.JWTPayload): {
    email?: string;
    name?: string;
    picture?: string;
    role?: string;
} {
    return {
        email: (typeof payload.email === 'string' && payload.email !== null) ? payload.email : undefined,
        name: (payload as any).name as string | undefined,
        picture: (payload as any).picture as string | undefined,
        role: (payload as any).role as string | undefined,
    };
}

/**
 * WebSocket Authentication Helper
 * Authenticates WebSocket connections using JWT tokens
 */
export async function authenticateWebSocket(
    headers: Record<string, string>,
    queryParams: Record<string, string>
): Promise<{ userId: string; payload: jose.JWTPayload }> {
    // Try to get token from headers first
    let token: string | null = null;
    
    const authHeader = headers.authorization || headers.Authorization;
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
        token = authHeader.split(" ", 2)[1];
    }
    
    // Fallback to query params (for WebSocket compatibility)
    if (!token) {
        token = queryParams.token;
    }
    
    if (!token) {
        throw new ConvexError('Missing authentication token for WebSocket connection');
    }
    
    try {
        const payload = await verifyJWT(token);
        const userId = getUserIdFromPayload(payload);
        
        if (!userId) {
            throw new ConvexError('Invalid token: no user ID found');
        }
        
        return { userId, payload };
    } catch (error) {
        throw new ConvexError(`WebSocket authentication failed: ${error}`);
    }
}

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
        image: identity.picture,
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

/**
 * Legacy Supabase token migration helper
 * Gradually migrates users from Supabase to Convex auth
 */
export async function migrateSupabaseUser(
    supabasePayload: jose.JWTPayload
): Promise<{ userId: string; migrated: boolean }> {
    const email = supabasePayload.email as string;
    const userId = getUserIdFromPayload(supabasePayload);
    
    if (!email || !userId) {
        throw new ConvexError('Invalid Supabase token: missing email or user ID');
    }
    
    // This would typically involve creating a Convex user record
    // and linking it to the Supabase user for seamless migration
    return {
        userId,
        migrated: true, // Flag indicating this user has been migrated
    };
}

/**
 * Environment-based feature flags for auth
 */
export const authConfig = {
    useSupabaseCompatibility: process.env.ENABLE_SUPABASE_COMPAT === 'true',
    allowAnonymousAccess: process.env.ALLOW_ANONYMOUS === 'true',
    enableRateLimit: process.env.ENABLE_RATE_LIMIT !== 'false',
    jwtExpirationHours: parseInt(process.env.JWT_EXPIRATION_HOURS || '24'),
};
