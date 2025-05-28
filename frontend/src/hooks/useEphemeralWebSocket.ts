import { useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import { useAuthToken } from '@convex-dev/auth/react';
import { CanvasObjectSpec, WhiteboardAction } from '@/lib/types';

/**
 * Hook for managing ephemeral whiteboard objects (pointers, highlights, question tags)
 * via the minimal WebSocket server. These objects have TTL and don't persist to the database.
 */
export function useEphemeralWebSocket(
  enabled: boolean,
  dispatchWhiteboardAction: (action: WhiteboardAction | WhiteboardAction[]) => void
) {
  const sessionId = useSessionStore(s => s.sessionId);
  const token = useAuthToken();
  const wsRef = useRef<WebSocket | null>(null);

  // Connect to ephemeral WebSocket endpoint
  useEffect(() => {
    if (!enabled || !sessionId || !token) return;

    const wsOrigin = process.env.NEXT_PUBLIC_BACKEND_WS_ORIGIN || 'ws://localhost:8080';
    const wsUrl = `${wsOrigin}/ws/ephemeral/${sessionId}?token=${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[useEphemeralWebSocket] Connected to ephemeral WebSocket');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'EPHEMERAL_INITIAL_STATE':
            // Add initial ephemeral objects to canvas
            if (message.objects && message.objects.length > 0) {
              const ephemeralSpecs = message.objects.map((obj: any) => ({
                id: obj.id,
                kind: obj.type + '_ephemeral',
                x: obj.x,
                y: obj.y,
                ...obj.data,
                metadata: {
                  isEphemeral: true,
                  expiresAt: obj.expiresAt,
                  userId: obj.userId,
                  source: 'ephemeral'
                }
              }));
              
              dispatchWhiteboardAction({
                type: 'ADD_EPHEMERAL_OBJECTS',
                objects: ephemeralSpecs
              } as any);
            }
            break;
            
          case 'EPHEMERAL_OBJECT_ADDED':
            // Add new ephemeral object
            if (message.object) {
              const spec: CanvasObjectSpec = {
                id: message.object.id,
                kind: message.object.type + '_ephemeral',
                x: message.object.x,
                y: message.object.y,
                ...message.object.data,
                metadata: {
                  isEphemeral: true,
                  expiresAt: message.object.expiresAt,
                  userId: message.object.userId,
                  source: 'ephemeral'
                }
              };
              
              dispatchWhiteboardAction({
                type: 'ADD_EPHEMERAL',
                spec
              } as any);
            }
            break;
            
          case 'EPHEMERAL_OBJECT_REMOVED':
            // Remove ephemeral object
            dispatchWhiteboardAction({
              type: 'DELETE_EPHEMERAL',
              id: message.objectId
            } as any);
            break;
            
          case 'EPHEMERAL_OBJECTS_EXPIRED':
            // Remove expired objects
            if (message.expiredIds && message.expiredIds.length > 0) {
              message.expiredIds.forEach((id: string) => {
                dispatchWhiteboardAction({
                  type: 'DELETE_EPHEMERAL',
                  id
                } as any);
              });
            }
            break;
            
          default:
            console.warn('[useEphemeralWebSocket] Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('[useEphemeralWebSocket] Failed to parse message:', error);
      }
    };

    ws.onclose = () => {
      console.log('[useEphemeralWebSocket] Disconnected from ephemeral WebSocket');
    };

    ws.onerror = (error) => {
      console.error('[useEphemeralWebSocket] WebSocket error:', error);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [enabled, sessionId, token, dispatchWhiteboardAction]);

  // Function to add ephemeral objects
  const writeEphemeral = useCallback((spec: CanvasObjectSpec) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[useEphemeralWebSocket] WebSocket not connected');
      return;
    }

    // Determine object type from spec
    let objectType: 'pointer' | 'highlight' | 'question_tag' = 'pointer';
    if (spec.kind?.includes('highlight')) {
      objectType = 'highlight';
    } else if (spec.kind?.includes('question')) {
      objectType = 'question_tag';
    }

    // Calculate TTL based on object type
    let ttl = 5000; // Default 5 seconds
    if (objectType === 'highlight') {
      ttl = 60000; // 1 minute for highlights
    } else if (objectType === 'pointer') {
      ttl = 3000; // 3 seconds for pointers
    } else if (objectType === 'question_tag') {
      ttl = 300000; // 5 minutes for question tags
    }

    const message = {
      type: 'ADD_EPHEMERAL',
      object: {
        id: spec.id,
        type: objectType,
        x: spec.x || 0,
        y: spec.y || 0,
        data: {
          // Include other spec properties as data
          kind: spec.kind,
          width: spec.width,
          height: spec.height,
          stroke: spec.stroke,
          strokeWidth: spec.strokeWidth,
          fill: spec.fill,
          points: spec.points,
          text: spec.text,
          fontSize: spec.fontSize,
          ...spec.metadata
        },
        expiresAt: Date.now() + ttl
      }
    };

    try {
      wsRef.current.send(JSON.stringify(message));
      
      // Optimistically add to canvas
      dispatchWhiteboardAction({
        type: 'ADD_EPHEMERAL',
        spec: {
          ...spec,
          metadata: {
            ...spec.metadata,
            isEphemeral: true,
            expiresAt: message.object.expiresAt,
            source: 'ephemeral'
          }
        }
      } as any);
      
    } catch (error) {
      console.error('[useEphemeralWebSocket] Failed to send ephemeral object:', error);
    }
  }, [dispatchWhiteboardAction]);

  return {
    writeEphemeral,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN
  };
}

export type UseEphemeralWebSocketReturnType = ReturnType<typeof useEphemeralWebSocket>; 