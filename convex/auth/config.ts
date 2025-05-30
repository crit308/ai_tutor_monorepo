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

// JWT configuration
export const JWT_SECRET = process.env.JWT_SECRET || '';

/**
 * JWT verification for Convex tokens
 */
export async function verifyJWT(token: string): Promise<jose.JWTPayload> {
    if (!JWT_SECRET) {
        throw new Error('JWT_SECRET not configured');
    }

    try {
        const secret = new TextEncoder().encode(JWT_SECRET);
        const { payload } = await jose.jwtVerify(token, secret);
        return payload;
    } catch (error) {
        throw new Error(`JWT verification failed: ${error}`);
    }
}

/**
 * Extract user ID from JWT payload
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
 * Environment-based feature flags for auth
 */
export const authConfig = {
    allowAnonymousAccess: process.env.ALLOW_ANONYMOUS === 'true',
    enableRateLimit: process.env.ENABLE_RATE_LIMIT !== 'false',
    jwtExpirationHours: parseInt(process.env.JWT_EXPIRATION_HOURS || '24'),
}; 