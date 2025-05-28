"use node";

import { WebSocketServer } from 'ws';
import * as http from 'http';
import url from 'url';
import * as jwt from 'jsonwebtoken';

// Configuration
const port = Number(process.env.WS_PORT || 8080);
const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret';
const server = http.createServer();

// Simple connection tracking
const sessions = new Map<string, Set<any>>();
const connections = new Map<any, ConnectionMetadata>();

interface ConnectionMetadata {
  userId: string;
  sessionId: string;
  connectionType: 'tutor' | 'ephemeral';
  lastHeartbeat: number;
}

interface EphemeralObject {
  id: string;
  type: 'pointer' | 'highlight' | 'question_tag';
  x?: number;
  y?: number;
  data?: any;
  expiresAt: number;
  userId: string;
}

// Ephemeral objects storage (TTL-based)
const ephemeralObjects = new Map<string, Map<string, EphemeralObject>>();

// JWT Authentication
async function authenticateConnection(token: string): Promise<{ userId: string } | null> {
  try {
    if (!token) return null;
    
    const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;
    
    // Development mode fallback
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
    
    if (process.env.NODE_ENV === 'development') {
      console.warn('Development mode: Using fallback authentication');
      return { userId: 'dev-user-' + Math.random().toString(36).substring(2, 15) };
    }
    
    return null;
  }
}

// Message broadcasting
function broadcast(sessionId: string, message: any, origin: any, exclude?: string[]) {
  const sessionConnections = sessions.get(sessionId);
  if (!sessionConnections) return;

  const messageStr = JSON.stringify(message);
  
  sessionConnections.forEach(ws => {
    if (ws !== origin && ws.readyState === 1) { // WebSocket.OPEN = 1
      const metadata = connections.get(ws);
      if (!metadata || (exclude && exclude.includes(metadata.userId))) return;
      
      try {
        ws.send(messageStr);
      } catch (error) {
        console.error('Failed to broadcast message:', error);
        sessionConnections.delete(ws);
        connections.delete(ws);
      }
    }
  });
}

// Ephemeral object management
function addEphemeralObject(sessionId: string, obj: EphemeralObject) {
  if (!ephemeralObjects.has(sessionId)) {
    ephemeralObjects.set(sessionId, new Map());
  }
  
  ephemeralObjects.get(sessionId)!.set(obj.id, obj);
  
  // Broadcast to session
  broadcast(sessionId, {
    type: 'EPHEMERAL_OBJECT_ADDED',
    object: obj
  }, null, [obj.userId]); // Exclude sender
}

function removeEphemeralObject(sessionId: string, objectId: string) {
  const sessionObjects = ephemeralObjects.get(sessionId);
  if (!sessionObjects) return false;
  
  const deleted = sessionObjects.delete(objectId);
  if (deleted) {
    broadcast(sessionId, {
      type: 'EPHEMERAL_OBJECT_REMOVED',
      objectId
    }, null);
  }
  
  return deleted;
}

function getEphemeralObjects(sessionId: string): EphemeralObject[] {
  const sessionObjects = ephemeralObjects.get(sessionId);
  if (!sessionObjects) return [];
  
  const now = Date.now();
  const validObjects: EphemeralObject[] = [];
  
  // Clean up expired objects while collecting valid ones
  sessionObjects.forEach((obj, id) => {
    if (obj.expiresAt < now) {
      sessionObjects.delete(id);
    } else {
      validObjects.push(obj);
    }
  });
  
  return validObjects;
}

// Connection handler
async function handleConnection(ws: any, sessionId: string, connectionType: 'tutor' | 'ephemeral', token: string) {
  const auth = await authenticateConnection(token);
  if (!auth) {
    ws.close(1008, 'Authentication failed');
    return;
  }
  
  // Store connection metadata
  const metadata: ConnectionMetadata = {
    userId: auth.userId,
    sessionId,
    connectionType,
    lastHeartbeat: Date.now()
  };
  connections.set(ws, metadata);
  
  // Track session
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new Set());
  }
  sessions.get(sessionId)!.add(ws);
  
  console.log(`[MinimalWS] Connected: ${connectionType} for session ${sessionId}, user ${auth.userId}`);

  // Send initial state
  try {
    if (connectionType === 'ephemeral') {
      // Send current ephemeral objects
      const objects = getEphemeralObjects(sessionId);
      ws.send(JSON.stringify({
        type: 'EPHEMERAL_INITIAL_STATE',
        objects
      }));
    } else {
      // Send tutor connection acknowledgment
      ws.send(JSON.stringify({
        type: 'TUTOR_CONNECTED',
        sessionId,
        timestamp: Date.now()
      }));
    }
  } catch (error) {
    console.error('Failed to send initial state:', error);
  }

  // Handle messages
  ws.on('message', async (data: any) => {
    metadata.lastHeartbeat = Date.now();
    
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'heartbeat') {
        ws.send(JSON.stringify({ type: 'heartbeat_ack', timestamp: Date.now() }));
        return;
      }
      
      if (connectionType === 'ephemeral') {
        await handleEphemeralMessage(sessionId, message, auth.userId, ws);
      } else if (connectionType === 'tutor') {
        await handleTutorMessage(sessionId, message, auth.userId, ws);
      }
      
    } catch (error) {
      console.error(`Failed to handle message for session ${sessionId}:`, error);
    }
  });

  // Handle close
  ws.on('close', () => {
    console.log(`[MinimalWS] Disconnected: session ${sessionId}, user ${auth.userId}`);
    connections.delete(ws);
    
    const sessionConnections = sessions.get(sessionId);
    if (sessionConnections) {
      sessionConnections.delete(ws);
      if (sessionConnections.size === 0) {
        sessions.delete(sessionId);
        // Clean up ephemeral objects for empty sessions
        ephemeralObjects.delete(sessionId);
        console.log(`[MinimalWS] Cleaned up empty session ${sessionId}`);
      }
    }
  });

  ws.on('error', (error: any) => {
    console.error(`[MinimalWS] WebSocket error for session ${sessionId}:`, error);
    connections.delete(ws);
  });
}

// Handle ephemeral messages (pointers, highlights, question tags)
async function handleEphemeralMessage(sessionId: string, message: any, userId: string, ws: any) {
  switch (message.type) {
    case 'ADD_EPHEMERAL':
      const obj: EphemeralObject = {
        id: message.object.id || `${userId}-${Date.now()}`,
        type: message.object.type,
        x: message.object.x,
        y: message.object.y,
        data: message.object.data,
        expiresAt: message.object.expiresAt || (Date.now() + 5000), // Default 5s TTL
        userId
      };
      addEphemeralObject(sessionId, obj);
      break;
      
    case 'REMOVE_EPHEMERAL':
      removeEphemeralObject(sessionId, message.objectId);
      break;
      
    default:
      console.warn(`[MinimalWS] Unknown ephemeral message type: ${message.type}`);
  }
}

// Handle tutor messages (AI streaming, chat)
async function handleTutorMessage(sessionId: string, message: any, userId: string, ws: any) {
  switch (message.type) {
    case 'STREAM_AI_RESPONSE':
      // Stream AI response character by character
      await streamAIResponse(sessionId, message.prompt, ws);
      break;
      
    case 'USER_MESSAGE':
      // Handle user chat message
      broadcast(sessionId, {
        type: 'USER_MESSAGE_RECEIVED',
        userId,
        text: message.text,
        timestamp: Date.now()
      }, ws);
      
      // Automatically trigger AI response for user messages
      console.log(`[MinimalWS] User message received: ${message.text}`);
      await streamAIResponse(sessionId, message.text, ws);
      break;
      
    default:
      console.warn(`[MinimalWS] Unknown tutor message type: ${message.type}`);
  }
}

// AI response streaming (placeholder - will be implemented in Phase 2)
async function streamAIResponse(sessionId: string, prompt: string, ws: any) {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.error('[MinimalWS] OpenAI API key not configured');
      ws.send(JSON.stringify({
        type: 'AI_STREAM_ERROR',
        error: 'AI service not configured'
      }));
      return;
    }

    // Call OpenAI streaming API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI tutor. Provide clear, educational responses to help students learn.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response stream reader');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponse = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.trim() === 'data: [DONE]') {
            // Send completion signal
            ws.send(JSON.stringify({
              type: 'AI_STREAM_DELTA',
              delta: '',
              isComplete: true,
              fullResponse
            }));
            return;
          }

          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const delta = data.choices?.[0]?.delta?.content;
              
              if (delta) {
                fullResponse += delta;
                ws.send(JSON.stringify({
                  type: 'AI_STREAM_DELTA',
                  delta,
                  isComplete: false
                }));
              }
            } catch (parseError) {
              console.warn('[MinimalWS] Failed to parse SSE data:', parseError);
            }
          }
        }
      }

      // Ensure completion is sent even if [DONE] wasn't received
      ws.send(JSON.stringify({
        type: 'AI_STREAM_DELTA',
        delta: '',
        isComplete: true,
        fullResponse
      }));

    } finally {
      reader.releaseLock();
    }

  } catch (error) {
    console.error('[MinimalWS] AI streaming error:', error);
    ws.send(JSON.stringify({
      type: 'AI_STREAM_ERROR',
      error: error instanceof Error ? error.message : 'Unknown AI service error'
    }));
  }
}

// Garbage collection for ephemeral objects
function startEphemeralGC(intervalMs: number = 10000) {
  setInterval(() => {
    const now = Date.now();
    let totalCleaned = 0;
    
    ephemeralObjects.forEach((sessionObjects, sessionId) => {
      const expired: string[] = [];
      
      sessionObjects.forEach((obj, id) => {
        if (obj.expiresAt < now) {
          expired.push(id);
        }
      });
      
      if (expired.length > 0) {
        expired.forEach(id => sessionObjects.delete(id));
        totalCleaned += expired.length;
        
        // Notify clients of cleanup
        broadcast(sessionId, {
          type: 'EPHEMERAL_OBJECTS_EXPIRED',
          expiredIds: expired
        }, null);
      }
    });
    
    if (totalCleaned > 0) {
      console.log(`[MinimalWS] GC: Cleaned up ${totalCleaned} expired ephemeral objects`);
    }
  }, intervalMs);
}

// Heartbeat monitor
function startHeartbeatMonitor(intervalMs: number = 30000) {
  setInterval(() => {
    const now = Date.now();
    const staleThreshold = 60000; // 60 seconds
    const staleConnections: any[] = [];

    connections.forEach((metadata, ws) => {
      if ((now - metadata.lastHeartbeat) > staleThreshold) {
        staleConnections.push(ws);
      }
    });

    staleConnections.forEach(ws => {
      console.log(`[MinimalWS] Terminating stale connection`);
      ws.close();
    });
  }, intervalMs);
}

// WebSocket server setup
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', async (req, socket, head) => {
  try {
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host}`);
    
    // Route patterns:
    // /ws/tutor/{sessionId} - AI streaming and chat
    // /ws/ephemeral/{sessionId} - Ephemeral objects (pointers, highlights)
    const tutorMatch = reqUrl.pathname.match(/^\/ws\/tutor\/([^/]+)$/);
    const ephemeralMatch = reqUrl.pathname.match(/^\/ws\/ephemeral\/([^/]+)$/);

    const sessionId = tutorMatch?.[1] || ephemeralMatch?.[1];
    const connectionType = tutorMatch ? 'tutor' : 'ephemeral';

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
      token = reqUrl.searchParams.get('token') || '';
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
    console.error('[MinimalWS] Error during WebSocket upgrade:', error);
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[MinimalWS] Received SIGTERM, closing server gracefully...');
  server.close(() => {
    console.log('[MinimalWS] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[MinimalWS] Received SIGINT, closing server gracefully...');
  server.close(() => {
    console.log('[MinimalWS] Server closed');
    process.exit(0);
  });
});

// Start server
server.listen(port, () => {
  console.log(`[MinimalWS] Minimal WebSocket server listening on port ${port}`);
  console.log('Supported endpoints:');
  console.log(`  - /ws/tutor/{sessionId} (AI streaming, chat)`);
  console.log(`  - /ws/ephemeral/{sessionId} (pointers, highlights, question tags)`);
  console.log('✅ Minimal WebSocket Server - ACTIVE');
  
  startEphemeralGC();
  startHeartbeatMonitor();
  console.log('✅ Background services started: GC, heartbeat monitoring');
}); 