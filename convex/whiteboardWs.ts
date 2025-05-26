/**
 * @fileoverview Simple Whiteboard WebSocket Handler for Convex
 * 
 * This module extends the existing wsServer with Yjs document synchronization
 * for the collaborative whiteboard. It integrates with the established connection
 * patterns and focuses on core Yjs functionality.
 * 
 * Key Features:
 * - Yjs document management with in-memory registry
 * - Content validation and sanitization
 * - Simple conflict resolution
 * 
 * Integrates with: convex/wsServer.ts
 */

import * as Y from 'yjs';

// Simple types for whiteboard objects
interface WhiteboardObjectSpec {
    id: string;
    metadata?: {
        source?: string;
        expiresAt?: number;
        [key: string]: any;
    };
    [key: string]: any;
}

// Document registry
const sessionDocs = new Map<string, Y.Doc>();
const VALID_SOURCE = "user";

/**
 * Get or create Y.Doc for a session
 */
export function getOrCreateDoc(sessionId: string): Y.Doc {
    if (sessionDocs.has(sessionId)) {
        return sessionDocs.get(sessionId)!;
    }

    const ydoc = new Y.Doc();
    sessionDocs.set(sessionId, ydoc);
    
    console.log(`[whiteboard] Created new Y.Doc for session ${sessionId}`);
    return ydoc;
}

/**
 * Validate and sanitize whiteboard content
 * Ensures all objects have metadata.source = "user" for security
 */
export function validateAndSanitizeContent(ydoc: Y.Doc, userId: string): void {
    try {
        const objectsMap = ydoc.getMap('objects');
        const patchQueue: Array<{ key: string; spec: WhiteboardObjectSpec }> = [];

        // Check all objects in the map
        objectsMap.forEach((spec: any, key: string) => {
            if (typeof spec !== 'object' || spec === null) return;

            const metadata = spec.metadata || {};
            if (metadata.source !== VALID_SOURCE) {
                metadata.source = VALID_SOURCE;
                spec.metadata = metadata;
                patchQueue.push({ key, spec });
            }
        });

        // Apply sanitized specs back if needed
        if (patchQueue.length > 0) {
            ydoc.transact(() => {
                patchQueue.forEach(({ key, spec }) => {
                    objectsMap.set(key, spec);
                });
            });

            console.warn(
                `[whiteboard] Sanitized ${patchQueue.length} object(s) with invalid owner field from user ${userId}`
            );
        }
    } catch (error) {
        console.error('[whiteboard] Content validation error:', error);
    }
}

/**
 * Handle whiteboard message (Yjs binary update)
 */
export function handleWhiteboardMessage(
    sessionId: string, 
    data: Buffer, 
    userId: string,
    broadcastFunction: (data: Buffer) => void
): void {
    try {
        // Get or create Y.Doc for this session
        const ydoc = getOrCreateDoc(sessionId);

        // Apply the Yjs update
        Y.applyUpdate(ydoc, data);

        // Validate and sanitize content
        validateAndSanitizeContent(ydoc, userId);

        // The original message is already broadcasted by wsServer
        // We just needed to apply it to our Y.Doc and validate it
        
        console.log(`[whiteboard] Applied Yjs update for session ${sessionId} from user ${userId}`);
    } catch (error) {
        console.error('[whiteboard] Error processing Yjs update:', error);
    }
}

/**
 * Get initial state for a new whiteboard connection
 */
export function getInitialState(sessionId: string): Buffer | null {
    const ydoc = sessionDocs.get(sessionId);
    if (!ydoc) return null;

    try {
        const stateBytes = Y.encodeStateAsUpdate(ydoc);
        if (stateBytes.length > 0) {
            console.log(`[whiteboard] Sending initial state (${stateBytes.length} bytes) for session ${sessionId}`);
            return Buffer.from(stateBytes);
        }
    } catch (error) {
        console.error('[whiteboard] Error encoding initial state:', error);
    }

    return null;
}

/**
 * Clean up Y.Doc when session ends
 */
export function cleanupSession(sessionId: string): void {
    if (sessionDocs.has(sessionId)) {
        const ydoc = sessionDocs.get(sessionId);
        if (ydoc) {
            ydoc.destroy();
        }
        sessionDocs.delete(sessionId);
        console.log(`[whiteboard] Cleaned up Y.Doc for session ${sessionId}`);
    }
}

/**
 * Garbage collection for ephemeral objects
 */
export function startEphemeralGC(intervalMs: number = 10000): void {
    setInterval(() => {
        const now = Date.now();

        sessionDocs.forEach((ydoc, sessionId) => {
            try {
                ydoc.transact(() => {
                    const ephemeralMap = ydoc.getMap('ephemeral');
                    const keysToDelete: string[] = [];

                    ephemeralMap.forEach((spec: any, key: string) => {
                        const metadata = spec?.metadata || {};
                        const expiresAt = metadata.expiresAt || 0;
                        
                        if (expiresAt < now) {
                            keysToDelete.push(key);
                        }
                    });

                    if (keysToDelete.length > 0) {
                        keysToDelete.forEach(key => {
                            ephemeralMap.delete(key);
                        });
                        console.log(`[whiteboard] GC removed ${keysToDelete.length} expired objects from session ${sessionId}`);
                    }
                });
            } catch (error) {
                console.error('[whiteboard] Ephemeral GC error:', error);
            }
        });
    }, intervalMs);
}

// Export for integration
export { sessionDocs }; 