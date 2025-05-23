import { useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { useSessionStore } from '@/store/sessionStore';
import { useAuthToken } from '@convex-dev/auth/react';
import { CanvasObjectSpec, WhiteboardAction } from '@/lib/types';

/**
 * React hook that maintains a Y.Doc for the current session and bridges updates
 * to / from the <WhiteboardProvider>.  The hook connects to the Phase-0 backend
 * WebSocket endpoint (`/ws/v2/session/{id}/whiteboard`) and:
 *   1. Applies *remote* updates to the local Y.Doc.
 *   2. Relays *local* Y.Doc updates back to the server.
 *   3. Converts Y.MapChanges into WhiteboardActions so that Fabric.js can render
 *      them through the existing dispatchWhiteboardAction API.
 *
 * Only a very small subset of changes are handled: when an entry is added to
 * the top-level `objects` Y.Map we emit an `ADD_OBJECTS` action; when an entry
 * is deleted we emit `DELETE_OBJECTS`.  This is sufficient for Phase-0, which
 * focuses on unidirectional AI-driven drawing.
 */
export function useYjsWhiteboard(
  enabled: boolean,
  dispatchWhiteboardAction: (action: WhiteboardAction | WhiteboardAction[]) => void
): UseYjsWhiteboardReturnType {
  const sessionId = useSessionStore(s => s.sessionId);
  const token = useAuthToken();

  const wsRef = useRef<WebSocket | null>(null);
  const docRef = useRef<Y.Doc | null>(null);

  // Function to add/update an ephemeral object in the Yjs doc
  const writeEphemeral = useCallback((spec: CanvasObjectSpec) => {
    if (!docRef.current) return;
    const ephemeralMap = docRef.current.getMap<CanvasObjectSpec>('ephemeral');
    ephemeralMap.set(spec.id, spec);
  }, []);

  useEffect(() => {
    if (!enabled || !sessionId || !token) return;

    const backendOrigin = process.env.NEXT_PUBLIC_BACKEND_WS_ORIGIN || 'ws://localhost:8080';
    const wsUrl = `${backendOrigin}/ws/v2/session/${sessionId}/whiteboard?token=${token}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    const doc = new Y.Doc();
    docRef.current = doc;

    // ------- Relay local updates to server ------- //
    doc.on('update', (update: Uint8Array, origin) => {
      if (origin === 'remote') return; // Skip echoes
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(update);
      }
    });

    // Map of CanvasObjectSpec keyed by id
    const objectsMap = doc.getMap<CanvasObjectSpec>('objects');

    // Helper to convert full map to ADD_OBJECTS (initial sync)
    const emitFullCanvas = () => {
      // Always dispatch a visual clear first to reset the Fabric canvas to a known empty state
      // before adding objects from Yjs. This ensures no old Fabric objects linger if Yjs state is empty.
      dispatchWhiteboardAction({ type: 'CLEAR_CANVAS', scope: 'visual_only' } as WhiteboardAction);

      const currentObjectsMap = docRef.current?.getMap<CanvasObjectSpec>('objects');
      if (currentObjectsMap) {
        const allSpecs: CanvasObjectSpec[] = Array.from(currentObjectsMap.values());
        if (allSpecs.length) {
          dispatchWhiteboardAction({ type: 'ADD_OBJECTS', objects: allSpecs } as any);
        }
      } else {
        console.warn("[useYjsWhiteboard] Yjs document or objectsMap not available in emitFullCanvas");
      }
    };

    // ------- Observe semantic object changes ------- //
    objectsMap.observe(event => {
      const added: CanvasObjectSpec[] = [];
      const deleted: string[] = [];
      const updated: Partial<CanvasObjectSpec>[] = [];

      event.keys.forEach((change, key) => {
        if (change.action === 'add') {
          const spec = objectsMap.get(key);
          if (spec) added.push(spec);
        } else if (change.action === 'delete') {
          deleted.push(key);
        } else if (change.action === 'update') {
          const spec = objectsMap.get(key);
          if (spec) updated.push(spec);
        }
      });

      if (added.length) dispatchWhiteboardAction({ type: 'ADD_OBJECTS', objects: added } as any);
      if (updated.length) dispatchWhiteboardAction({ type: 'UPDATE_OBJECTS', objects: updated } as any);
      if (deleted.length) dispatchWhiteboardAction({ type: 'DELETE_OBJECTS', ids: deleted } as any);
    });

    // ------- Observe ephemeral object changes ------- //
    const ephemeralMap = doc.getMap<CanvasObjectSpec>('ephemeral');
    ephemeralMap.observe(event => {
      event.keys.forEach((change, key) => {
        if (change.action === 'add') {
          const spec = ephemeralMap.get(key);
          if (spec) dispatchWhiteboardAction({ type: 'ADD_EPHEMERAL', spec } as any);
        } else if (change.action === 'delete') {
          dispatchWhiteboardAction({ type: 'DELETE_EPHEMERAL', id: key } as any);
        }
      });
    });

    // ------- WebSocket handlers ------- //
    ws.onopen = () => {
      // No-op; initial state will arrive via server soon.
    };

    ws.onmessage = ev => {
      const data = new Uint8Array(ev.data);
      Y.applyUpdate(doc, data, 'remote');
    };

    ws.onclose = () => {
      console.info('[useYjsWhiteboard] socket closed');
    };

    ws.onerror = err => {
      console.error('[useYjsWhiteboard] socket error', err);
    };

    // When the Y.Doc is initially synced (or any time we connect) populate canvas
    emitFullCanvas();

    return () => {
      ws.close();
      doc.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionId, token, dispatchWhiteboardAction]);

  // Return the write function so components can use it
  return { writeEphemeral, getYjsDoc: () => docRef.current };
}

// Modify the hook return type
export type UseYjsWhiteboardReturnType = {
  writeEphemeral: (spec: CanvasObjectSpec) => void;
  getYjsDoc: () => Y.Doc | null;
};

// Initial hook call remains the same, but we might want to access the returned value later
// Original call: export function useYjsWhiteboard(enabled: boolean): void {
// Maybe change signature if we need to return writeEphemeral from the Provider instead?
// For now, keeping the return type minimal, assuming components will call the hook directly if needed. 