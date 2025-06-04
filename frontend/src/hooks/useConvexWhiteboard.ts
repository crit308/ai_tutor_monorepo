import { useEffect, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from 'convex_generated/api';
import { useSessionStore } from '@/store/sessionStore';
import { CanvasObjectSpec, WhiteboardAction } from '@/lib/types';
import { Id } from 'convex_generated/dataModel';

/**
 * React hook that manages persistent whiteboard objects via Convex real-time subscriptions.
 * This replaces the Yjs-based approach with Convex's native real-time capabilities.
 * 
 * Features:
 * - Real-time sync of persistent whiteboard objects
 * - Automatic updates when objects are added/modified/deleted
 * - Type-safe mutations with error handling
 * - Optimistic updates for better UX
 */
export function useConvexWhiteboard(
  enabled: boolean,
  dispatchWhiteboardAction: (action: WhiteboardAction | WhiteboardAction[]) => void
) {
  const sessionId = useSessionStore(s => s.sessionId);

  // Query for persistent whiteboard objects with real-time updates
  const whiteboardObjects = useQuery(
    api.functions.getWhiteboardObjects,
    enabled && sessionId ? { sessionId: sessionId as Id<"sessions"> } : 'skip'
  );

  // Mutations for whiteboard operations
  const addObject = useMutation(api.functions.addWhiteboardObject);
  const updateObject = useMutation(api.functions.updateWhiteboardObject);
  const deleteObject = useMutation(api.functions.deleteWhiteboardObject);
  const clearObjects = useMutation(api.functions.clearWhiteboardObjects);

  // Sync Convex data to Fabric.js canvas when objects change
  useEffect(() => {
    if (!enabled || !whiteboardObjects) return;

    // Clear canvas and add all current objects
    dispatchWhiteboardAction({ type: 'CLEAR_CANVAS', scope: 'visual_only' } as WhiteboardAction);
    
    if (whiteboardObjects.length > 0) {
      const objectSpecs = whiteboardObjects.map(obj => ({
        id: obj.id,
        ...obj,
        metadata: {
          ...obj.metadata,
          source: 'convex', // Mark as coming from Convex
          synced: true
        }
      }));
      
      dispatchWhiteboardAction({ 
        type: 'ADD_OBJECTS', 
        objects: objectSpecs 
      } as any);
    }
  }, [whiteboardObjects, enabled, dispatchWhiteboardAction]);

  // Public API for adding objects
  const addWhiteboardObject = useCallback(async (objectSpec: CanvasObjectSpec) => {
    if (!sessionId) {
      console.warn('[useConvexWhiteboard] No session ID available');
      return;
    }

    try {
      // Optimistic update - add to canvas immediately
      dispatchWhiteboardAction({
        type: 'ADD_OBJECTS',
        objects: [{ ...objectSpec, metadata: { ...objectSpec.metadata, optimistic: true } }]
      } as any);

      // Persist to Convex
      await addObject({
        sessionId: sessionId as Id<"sessions">,
        objectSpec
      });

      console.log(`[useConvexWhiteboard] Added object ${objectSpec.id}`);
    } catch (error) {
      console.error('[useConvexWhiteboard] Failed to add object:', error);
      
      // Remove optimistic update on error
      dispatchWhiteboardAction({
        type: 'DELETE_OBJECTS',
        ids: [objectSpec.id]
      } as any);
    }
  }, [sessionId, addObject, dispatchWhiteboardAction]);

  // Public API for updating objects
  const updateWhiteboardObject = useCallback(async (objectId: string, objectSpec: CanvasObjectSpec) => {
    if (!sessionId) {
      console.warn('[useConvexWhiteboard] No session ID available');
      return;
    }

    try {
      await updateObject({
        sessionId: sessionId as Id<"sessions">,
        objectId,
        objectSpec
      });

      console.log(`[useConvexWhiteboard] Updated object ${objectId}`);
    } catch (error) {
      console.error('[useConvexWhiteboard] Failed to update object:', error);
    }
  }, [sessionId, updateObject]);

  // Public API for deleting objects
  const deleteWhiteboardObject = useCallback(async (objectId: string) => {
    if (!sessionId) {
      console.warn('[useConvexWhiteboard] No session ID available');
      return;
    }

    try {
      // Optimistic update - remove from canvas immediately
      dispatchWhiteboardAction({
        type: 'DELETE_OBJECTS',
        ids: [objectId]
      } as any);

      // Delete from Convex
      await deleteObject({
        sessionId: sessionId as Id<"sessions">,
        objectId
      });

      console.log(`[useConvexWhiteboard] Deleted object ${objectId}`);
    } catch (error) {
      console.error('[useConvexWhiteboard] Failed to delete object:', error);
      // TODO: Restore object on error
    }
  }, [sessionId, deleteObject, dispatchWhiteboardAction]);

  // Public API for clearing all objects
  const clearWhiteboardObjects = useCallback(async () => {
    if (!sessionId) {
      console.warn('[useConvexWhiteboard] No session ID available');
      return;
    }

    try {
      // Optimistic update - clear canvas immediately
      dispatchWhiteboardAction({ type: 'CLEAR_CANVAS', scope: 'all' } as WhiteboardAction);

      // Clear from Convex
      await clearObjects({
        sessionId: sessionId as Id<"sessions">
      });

      console.log(`[useConvexWhiteboard] Cleared all objects`);
    } catch (error) {
      console.error('[useConvexWhiteboard] Failed to clear objects:', error);
    }
  }, [sessionId, clearObjects, dispatchWhiteboardAction]);

  return {
    // State
    objects: whiteboardObjects || [],
    isLoading: whiteboardObjects === undefined,
    
    // Actions
    addObject: addWhiteboardObject,
    updateObject: updateWhiteboardObject,
    deleteObject: deleteWhiteboardObject,
    clearObjects: clearWhiteboardObjects,
  };
}

export type UseConvexWhiteboardReturnType = ReturnType<typeof useConvexWhiteboard>; 