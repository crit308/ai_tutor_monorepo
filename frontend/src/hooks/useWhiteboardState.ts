import { useQuery, useMutation } from 'convex/react';
import { api } from 'convex_generated/api';
import type { Id } from 'convex_generated/dataModel';
import { useSessionStore } from '@/store/sessionStore';
import { CanvasObjectSpec, WhiteboardAction } from '@/lib/types';
import type { WhiteboardPatch } from '@aitutor/whiteboard-schema';
import { useCallback, useRef } from 'react';

/**
 * Centralised client-side state hook for the primitives-first whiteboard.
 * It exposes the real-time object list and a helper to send semantic patches.
 *
 * All higher-level helpers (addObject, updateObject…) internally build a WhiteboardPatch
 * and call the Convex mutation, keeping optimistic UI consistent with Fabric.
 */
export function useWhiteboardState(
  dispatchWhiteboardAction: (action: WhiteboardAction | WhiteboardAction[]) => void
) {
  const sessionId = useSessionStore((s) => s.sessionId) as Id<'sessions'> | undefined;

  // ---- realtime objects ----
  const objects = useQuery(
    api.database.whiteboard.getWhiteboardObjects,
    sessionId ? { sessionId } : 'skip'
  );

  // ---- mutation ----
  const applyPatch = useMutation(api.database.whiteboard.applyWhiteboardPatch);

  // keep local boardVersion
  const versionRef = useRef<number | undefined>(undefined);

  // -------------- helpers --------------
  const sendPatch = useCallback(
    async (patch: WhiteboardPatch, optimisticActions?: WhiteboardAction | WhiteboardAction[]) => {
      if (!sessionId) return;
      try {
        // optimistic UI
        if (optimisticActions) dispatchWhiteboardAction(optimisticActions);
        const res = await applyPatch({ sessionId, patch, lastKnownVersion: versionRef.current });
        versionRef.current = res.newBoardVersion;
      } catch (e) {
        console.error('[useWhiteboardState] Patch failed', e);
        // TODO: we rely on realtime query to snap state back if needed
      }
    },
    [sessionId, applyPatch, dispatchWhiteboardAction]
  );

  // Add single object
  const addObject = useCallback(
    async (objectSpec: CanvasObjectSpec) => {
      const optimistic: WhiteboardAction = { type: 'ADD_OBJECTS', objects: [objectSpec] } as any;
      await sendPatch({ creates: [objectSpec as any] }, optimistic);
    },
    [sendPatch]
  );

  // Update object (partial diff)
  const updateObject = useCallback(
    async (objectId: string, diff: Partial<CanvasObjectSpec>) => {
      const optimistic: WhiteboardAction = {
        type: 'UPDATE_OBJECTS',
        objects: [{ id: objectId, ...diff } as any],
      } as any;
      await sendPatch({ updates: [{ id: objectId, diff: diff as any }] }, optimistic);
    },
    [sendPatch]
  );

  // Delete object
  const deleteObject = useCallback(
    async (objectId: string) => {
      const optimistic: WhiteboardAction = { type: 'DELETE_OBJECTS', ids: [objectId] } as any;
      await sendPatch({ deletes: [objectId] }, optimistic);
    },
    [sendPatch]
  );

  // Clear board (delete all ids)
  const clearObjects = useCallback(
    async () => {
      if (!objects) return;
      const ids = objects.map((o) => o.id);
      const optimistic: WhiteboardAction = { type: 'CLEAR_CANVAS', scope: 'all' } as any;
      await sendPatch({ deletes: ids }, optimistic);
    },
    [objects, sendPatch]
  );

  return {
    objects: objects || [],
    isLoading: objects === undefined,
    addObject,
    updateObject,
    deleteObject,
    clearObjects,
  } as const;
} 