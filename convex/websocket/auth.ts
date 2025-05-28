/**
 * @fileoverview WebSocket Authentication Middleware for Convex
 * 
 * Provides authentication middleware specifically for WebSocket connections,
 * including rate limiting and connection management.
 */

import { authenticateWebSocket, checkRateLimit } from "../auth";
import { api } from "../_generated/api";
import { ActionCtx } from "../_generated/server";

export interface WebSocketAuthResult {
  userId: string;
  sessionId?: string;
  isAuthenticated: boolean;
  error?: string;
}

export interface WebSocketConnection {
  id: string;
  userId: string;
  sessionId?: string;
  connectedAt: number;
  lastActivity: number;
}

// In-memory store for active WebSocket connections
const activeConnections = new Map<string, WebSocketConnection>();

/**
 * Authenticate a WebSocket connection with enhanced security
 */
export async function authenticateWSConnection(
  connectionId: string,
  headers: Record<string, string>,
  queryParams: Record<string, string>,
  sessionId?: string
): Promise<WebSocketAuthResult> {
  try {
    // Authenticate using JWT
    const { userId, payload } = await authenticateWebSocket(headers, queryParams);
    
    // Rate limiting for WebSocket connections
    if (!checkRateLimit(`ws:${userId}`, 5, 60000)) {
      return {
        userId: '',
        isAuthenticated: false,
        error: 'Rate limit exceeded for WebSocket connections',
      };
    }
    
    // Store connection info
    const connection: WebSocketConnection = {
      id: connectionId,
      userId,
      sessionId,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
    };
    
    activeConnections.set(connectionId, connection);
    
    console.log(`WebSocket authenticated: ${userId} on connection ${connectionId}`);
    
    return {
      userId,
      sessionId,
      isAuthenticated: true,
    };
    
  } catch (error) {
    console.error('WebSocket authentication failed:', error);
    return {
      userId: '',
      isAuthenticated: false,
      error: error instanceof Error ? error.message : 'Authentication failed',
    };
  }
}

/**
 * Verify session access for WebSocket operations
 */
export async function verifySessionAccess(
  ctx: ActionCtx,
  userId: string,
  sessionId: string
): Promise<boolean> {
  try {
    // Query the session to verify ownership
    const session = await ctx.runQuery(api.functions.getSessionContext, {
      sessionId: sessionId as any,
    });
    
    if (!session) {
      return false;
    }
    
    // Check if session belongs to the authenticated user
    const sessionUserId = (session.context as any)?.user_id;
    return sessionUserId === userId;
    
  } catch (error) {
    console.error('Session access verification failed:', error);
    return false;
  }
}

/**
 * Update activity timestamp for a connection
 */
export function updateConnectionActivity(connectionId: string): void {
  const connection = activeConnections.get(connectionId);
  if (connection) {
    connection.lastActivity = Date.now();
  }
}

/**
 * Clean up a WebSocket connection
 */
export function cleanupConnection(connectionId: string): void {
  const connection = activeConnections.get(connectionId);
  if (connection) {
    console.log(`Cleaning up WebSocket connection: ${connectionId} for user ${connection.userId}`);
    activeConnections.delete(connectionId);
  }
}

/**
 * Get active connections for a user
 */
export function getUserConnections(userId: string): WebSocketConnection[] {
  return Array.from(activeConnections.values()).filter(
    (conn) => conn.userId === userId
  );
}

/**
 * Get connection info by ID
 */
export function getConnection(connectionId: string): WebSocketConnection | undefined {
  return activeConnections.get(connectionId);
}

/**
 * Cleanup stale connections (older than 1 hour)
 */
export function cleanupStaleConnections(): void {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const [connectionId, connection] of activeConnections.entries()) {
    if (now - connection.lastActivity > oneHour) {
      console.log(`Removing stale connection: ${connectionId}`);
      activeConnections.delete(connectionId);
    }
  }
}

/**
 * Get connection statistics
 */
export function getConnectionStats(): {
  totalConnections: number;
  uniqueUsers: number;
  averageConnectionAge: number;
} {
  const connections = Array.from(activeConnections.values());
  const now = Date.now();
  
  const uniqueUsers = new Set(connections.map(c => c.userId)).size;
  const totalAge = connections.reduce((sum, c) => sum + (now - c.connectedAt), 0);
  const averageAge = connections.length > 0 ? totalAge / connections.length : 0;
  
  return {
    totalConnections: connections.length,
    uniqueUsers,
    averageConnectionAge: averageAge,
  };
}

// Periodic cleanup of stale connections (every 15 minutes)
setInterval(cleanupStaleConnections, 15 * 60 * 1000);

/**
 * Middleware function for WebSocket message handling
 */
export async function withWSAuth<T>(
  connectionId: string,
  handler: (userId: string, connection: WebSocketConnection) => Promise<T>
): Promise<T> {
  const connection = activeConnections.get(connectionId);
  
  if (!connection) {
    throw new Error('Connection not found or not authenticated');
  }
  
  // Update activity
  updateConnectionActivity(connectionId);
  
  // Rate limiting per user
  if (!checkRateLimit(`ws_msg:${connection.userId}`, 100, 60000)) {
    throw new Error('Message rate limit exceeded');
  }
  
  return await handler(connection.userId, connection);
}

/**
 * Validate WebSocket message format
 */
export function validateWSMessage(message: any): {
  valid: boolean;
  error?: string;
  type?: string;
  data?: any;
} {
  if (!message || typeof message !== 'object') {
    return { valid: false, error: 'Invalid message format' };
  }
  
  if (!message.type || typeof message.type !== 'string') {
    return { valid: false, error: 'Missing message type' };
  }
  
  // Additional validation based on message type
  const validTypes = [
    'interaction',
    'whiteboard_delta',
    'board_state_request',
    'ping',
    'end_session',
  ];
  
  if (!validTypes.includes(message.type)) {
    return { valid: false, error: `Invalid message type: ${message.type}` };
  }
  
  return {
    valid: true,
    type: message.type,
    data: message.data || {},
  };
} 