/**
 * @fileoverview Authentication utilities for Convex WebSocket handlers
 * 
 * Provides JWT verification and user authentication services
 * for WebSocket connections.
 */

import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import * as jose from 'jose';

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || '';

/**
 * Verify a JWT token and return the payload
 */
export async function verifyJWT(token: string): Promise<jose.JWTPayload> {
    if (!JWT_SECRET) {
        throw new Error('JWT_SECRET not configured');
    }

    try {
        // Create the secret key for verification
        const secret = new TextEncoder().encode(JWT_SECRET);
        
        // Verify the token
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
    return (payload.sub || payload.user_id || payload.id || '') as string;
}
