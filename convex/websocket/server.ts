import { WebSocketServer } from 'ws';
import http from 'http';
import url from 'url';
import * as jwt from 'jsonwebtoken';
import { handleWhiteboardMessage, getInitialState, cleanupSession, startEphemeralGC } from './whiteboardWs';
import { 
  handleTutorMessage, 
  hydrateInitialState, 
  cleanupTutorSession, 
  updateInteractionMode,
  initializeTutorWs
} from './tutorWs';
import { authenticateWebSocketConnection } from './auth';
import { handleTutorWebSocket } from './tutor';

// Configuration
const port = Number(process.env.WS_PORT || 8080);
const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret';
const server = http.createServer();

// Simple connection tracking
const sessions = new Map();
const connections = new Map();

// JWT Authentication helper
async function authenticateConnection(token: string) {
  try {
    if (!token) return null;
    
    const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;
    
    // In development mode, allow test tokens for easier testing
    if (process.env.NODE_ENV === 'development' && cleanToken.includes('test-user')) {
      return { userId: 'test-user-123' };
    }
    
    const decoded = jwt.verify(cleanToken, JWT_SECRET) as any;
    if (decoded && decoded.sub) {
      return { userId: decoded.sub };
    }
    return null;
  } catch (error) {
    console.error('JWT verification failed:', error);
    
    // In development, be more permissive for testing
    if (process.env.NODE_ENV === 'development') {
      console.warn('Development mode: Using fallback authentication');
      return { userId: 'dev-user-' + Math.random().toString(36).substring(2, 15) };
    }
    
    return null;
  }
}

// Message broadcasting
function broadcast(sessionId: string, data: any, origin: any, connectionType?: string) {
  const sessionData = sessions.get(sessionId);
  if (!sessionData) return;

  const targetType = connectionType || 'all';
  connections.forEach((metadata, ws) => {
    if (ws !== origin && 
        metadata.sessionId === sessionId && 
        (targetType === 'all' || metadata.connectionType === targetType) &&
        ws.readyState === 1) { // WebSocket.OPEN = 1
      try {
        ws.send(data);
      } catch (error) {
        console.error('Failed to send message:', error);
        connections.delete(ws);
      }
    }
  });
}

// Connection handler
async function handleConnection(ws: any, sessionId: string, connectionType: string, token: string) {
  // Authenticate
  const auth = await authenticateConnection(token);
  if (!auth) {
    ws.close(1008, 'Authentication failed');
    return;
  }
  
  // Store connection metadata
  const metadata = {
    userId: auth.userId,
    sessionId,
    connectionType,
    lastHeartbeat: Date.now()
  };
  connections.set(ws, metadata);
  
  // Track session
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { whiteboard: new Set(), tutor: new Set() });
  }
  sessions.get(sessionId)[connectionType].add(ws);
  
  console.log(`Added ${connectionType} connection for session ${sessionId}, user ${auth.userId}`);

  // Send acknowledgment and initial state
  try {
    if (connectionType === 'whiteboard') {
      // For whiteboard connections, send initial Yjs state instead of JSON acknowledgment
      const initialState = getInitialState(sessionId);
      if (initialState) {
        ws.send(initialState);
      }
    } else if (connectionType === 'tutor') {
      // For tutor connections, hydrate initial session state
      // Get session data to extract folderId
      let folderId: string | undefined;
      try {
        // Import Convex client setup (assuming it exists)
        const { ConvexHttpClient } = await import('convex/browser');
        const { api } = await import('./_generated/api');
        
        const convexUrl = process.env.CONVEX_URL;
        if (convexUrl) {
          const convexClient = new ConvexHttpClient(convexUrl);
          const sessionData = await convexClient.query(api.functions.getSessionEnhanced, {
            sessionId: sessionId as any
          });
          if (sessionData) {
            folderId = sessionData.folder_id;
            console.log(`[WebSocket] Found folderId ${folderId} for session ${sessionId}`);
          }
        }
      } catch (error) {
        console.warn(`[WebSocket] Failed to get folderId for session ${sessionId}:`, error);
      }
      
      await hydrateInitialState(sessionId, auth.userId, ws, folderId);
    } else {
      // For other connections, send JSON acknowledgment
      ws.send(JSON.stringify({
        type: 'connection_established',
        data: { sessionId, connectionType, timestamp: Date.now() }
      }));
    }
  } catch (error) {
    console.error('Failed to send acknowledgment:', error);
  }

  // Handle messages
  ws.on('message', async (data: any) => {
    metadata.lastHeartbeat = Date.now();
    
    if (connectionType === 'whiteboard') {
      // Handle whiteboard (Yjs) messages
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      
      // Process Yjs update and validate content
      handleWhiteboardMessage(sessionId, buffer, auth.userId, (broadcastData) => {
        broadcast(sessionId, broadcastData, ws, connectionType);
      });
      
      // Broadcast to peers
      broadcast(sessionId, data, ws, connectionType);
    } else if (connectionType === 'tutor') {
      // Handle tutor messages
      try {
        const message = JSON.parse(data.toString());
        
        // Handle whiteboard mode updates
        if (message.whiteboard_mode) {
          const success = updateInteractionMode(sessionId, message.whiteboard_mode);
          if (success) {
            console.log(`Updated interaction mode for session ${sessionId} to ${message.whiteboard_mode}`);
          }
        }
        
        await handleTutorMessage(sessionId, message, auth.userId, ws);
      } catch (error) {
        console.error(`Failed to handle tutor message for session ${sessionId}:`, error);
      }
    } else {
      // Handle other message types
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'heartbeat') {
          ws.send(JSON.stringify({ type: 'heartbeat_ack', timestamp: Date.now() }));
          return;
        }
      } catch {
        // Not JSON, treat as raw data
      }

      // Broadcast to peers
      broadcast(sessionId, data, ws, connectionType);
    }
  });

  // Handle close
  ws.on('close', () => {
    console.log(`Connection closed for session ${sessionId}, user ${auth.userId}`);
    connections.delete(ws);
    
    const sessionData = sessions.get(sessionId);
    if (sessionData) {
      sessionData[connectionType].delete(ws);
      if (sessionData.whiteboard.size === 0 && sessionData.tutor.size === 0) {
        sessions.delete(sessionId);
        cleanupSession(sessionId); // Clean up Yjs documents
        cleanupTutorSession(sessionId); // Clean up tutor session data
        console.log(`Cleaned up empty session ${sessionId}`);
      }
    }
  });

  // Handle errors
  ws.on('error', (error: any) => {
    console.error(`WebSocket error for session ${sessionId}:`, error);
    connections.delete(ws);
  });
}

const wss = new WebSocketServer({ noServer: true });

// Heartbeat monitor
setInterval(() => {
  const now = Date.now();
  const staleThreshold = 60000; // 60 seconds

  connections.forEach((metadata, ws) => {
    if ((now - metadata.lastHeartbeat) > staleThreshold) {
      console.log(`Terminating stale connection for session ${metadata.sessionId}`);
      ws.close();
    }
  });
}, 30000);

server.on('upgrade', async (req, socket, head) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const matchTutor = url.pathname.match(/^\/ws\/v2\/session\/([^/]+)$/);
    const matchWhiteboard = url.pathname.match(/^\/ws\/v2\/session\/([^/]+)\/whiteboard$/);

    const sessionId = matchTutor?.[1] || matchWhiteboard?.[1];
    const connectionType = matchWhiteboard ? 'whiteboard' : 'tutor';

    if (!sessionId) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    // Extract token
    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else {
      token = url.searchParams.get('token') || '';
    }

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Validate token
    const auth = await authenticateConnection(token);
    if (!auth) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, sessionId, connectionType, token);
    });

  } catch (error) {
    console.error('Error during WebSocket upgrade:', error);
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, closing WebSocket server gracefully...');
  server.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, closing WebSocket server gracefully...');
  server.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});

// Start server
server.listen(port, () => {
  console.log(`WebSocket server listening on port ${port}`);
  console.log('Supported endpoints:');
  console.log(`  - /ws/v2/session/{sessionId} (tutor)`);
  console.log(`  - /ws/v2/session/{sessionId}/whiteboard (whiteboard)`);
  console.log('✅ Phase 1 Task 1.1: WebSocket Foundation - COMPLETE');
  
  // Start ephemeral garbage collection for whiteboard objects
  startEphemeralGC();
  console.log('✅ Started ephemeral garbage collection for whiteboard objects');
});
