/**
 * @fileoverview WebSocket Authentication for unified Convex deployment
 * 
 * Contains WebSocket-specific authentication helpers
 */

import { ConvexError } from "convex/values";
import * as jose from 'jose';
import { verifyJWT, getUserIdFromPayload } from './config';

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