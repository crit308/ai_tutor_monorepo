import http from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';

const port = Number(process.env.WS_PORT || 8080);
const server = http.createServer();

// Map sessionId -> set of WebSocket connections
const sessions = new Map<string, Set<WebSocket>>();

function broadcast(sessionId: string, data: RawData, origin: WebSocket) {
  const peers = sessions.get(sessionId);
  if (!peers) return;
  for (const ws of peers) {
    if (ws !== origin && ws.readyState === WebSocket.OPEN) {
      ws.send(data, { binary: typeof data !== 'string' });
    }
  }
}

function handleConnection(ws: WebSocket, sessionId: string) {
  let peers = sessions.get(sessionId);
  if (!peers) {
    peers = new Set();
    sessions.set(sessionId, peers);
  }
  peers.add(ws);

  ws.on('message', (data, isBinary) => {
    broadcast(sessionId, data, ws);
  });

  ws.on('close', () => {
    peers!.delete(ws);
    if (peers!.size === 0) {
      sessions.delete(sessionId);
    }
  });
}

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const matchTutor = url.pathname.match(/^\/ws\/v2\/session\/([^/]+)$/);
  const matchWhiteboard = url.pathname.match(/^\/ws\/v2\/session\/([^/]+)\/whiteboard$/);

  const sessionId = matchTutor?.[1] || matchWhiteboard?.[1];
  if (!sessionId) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    handleConnection(ws, sessionId);
  });
});

server.listen(port, () => {
  console.log(`WebSocket server listening on port ${port}`);
});
