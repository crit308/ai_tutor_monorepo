import { WebSocketServer, WebSocket } from 'ws';
import { decodeJwt } from '@convex-dev/auth/server';
import type { JWTPayload } from '@convex-dev/auth/server';
import * as Y from 'yjs';

const port = parseInt(process.env.WS_PORT || '4001', 10);

interface TutorClients {
  [sessionId: string]: Set<WebSocket>;
}

interface WhiteboardSession {
  doc: Y.Doc;
  sockets: Set<WebSocket>;
}

const tutorClients: TutorClients = {};
const whiteboardSessions: Record<string, WhiteboardSession> = {};

function getWhiteboardSession(sessionId: string): WhiteboardSession {
  let session = whiteboardSessions[sessionId];
  if (!session) {
    session = { doc: new Y.Doc(), sockets: new Set() };
    whiteboardSessions[sessionId] = session;
  }
  return session;
}

function broadcast(update: Uint8Array, peers: Set<WebSocket>, origin: WebSocket) {
  for (const peer of peers) {
    if (peer === origin || peer.readyState !== WebSocket.OPEN) continue;
    try { peer.send(update); } catch { /* ignore */ }
  }
}

function sendInitialWhiteboardState(ws: WebSocket, session: WhiteboardSession) {
  const update = Y.encodeStateAsUpdate(session.doc);
  if (update.byteLength > 0) {
    try { ws.send(update); } catch { /* ignore */ }
  }
}

const wss = new WebSocketServer({ port });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const token = url.searchParams.get('token') || (req.headers['authorization']?.split(' ')[1]);
  const sessionMatch = url.pathname.match(/session\/([^/]+)/);
  const isWhiteboard = url.pathname.includes('whiteboard');
  const sessionId = sessionMatch ? sessionMatch[1] : null;

  if (!token || !sessionId) {
    ws.close(1008, 'Invalid request');
    return;
  }

  let payload: JWTPayload;
  try {
    payload = decodeJwt(token);
  } catch {
    ws.close(1008, 'Invalid token');
    return;
  }


  if (isWhiteboard) {
    const session = getWhiteboardSession(sessionId);
    session.sockets.add(ws);
    sendInitialWhiteboardState(ws, session);

    ws.on('message', (data) => {
      const update = new Uint8Array(data as ArrayBuffer);
      try { Y.applyUpdate(session.doc, update); } catch { return; }
      broadcast(update, session.sockets, ws);
    });

    ws.on('close', () => {
      session.sockets.delete(ws);
      if (session.sockets.size === 0) delete whiteboardSessions[sessionId];
    });
    return;
  }

  // Tutor websocket: minimal echo/heartbeat implementation
  if (!tutorClients[sessionId]) tutorClients[sessionId] = new Set();
  tutorClients[sessionId].add(ws);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      ws.send(JSON.stringify({ type: 'ack' }));
    } catch {
      ws.send(JSON.stringify({ type: 'error', detail: 'Invalid JSON' }));
    }
  });

  ws.on('close', () => {
    tutorClients[sessionId].delete(ws);
    if (tutorClients[sessionId].size === 0) delete tutorClients[sessionId];
  });
});

console.log(`WebSocket server listening on port ${port}`);
