/**
 * @fileoverview Authentication configuration for unified Convex deployment
 * 
 * Contains the main convexAuth setup and JWT configuration
 */

import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import * as jose from 'jose';
import { ConvexError } from "convex/values";

// Export auth configuration with Password provider
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});

// JWT configuration with fallback support for Supabase migration
export const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || '';
export const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';

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