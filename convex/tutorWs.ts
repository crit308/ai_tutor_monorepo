import { SupabaseClient } from '@supabase/supabase-js';
// Note: We'll need to add these Convex imports when the schema is ready
// import { ConvexClient } from 'convex/browser';

// Type definitions (minimal for Phase 1)
interface UserModelState {
  concepts: Record<string, any>;
  overall_progress: number;
  current_topic: string | null;
  session_summary: string;
}

interface TutorContext {
  session_id: string;
  user_id: string;
  folder_id?: string;
  state?: string;
  interaction_mode: 'chat_only' | 'chat_and_whiteboard';
  user_model_state: UserModelState;
  history: Array<{ role: string; content: string }>;
  current_focus_objective?: any;
  current_quiz_question?: any;
  last_pedagogical_action?: string;
}

interface InteractionResponseData {
  content_type: string;
  data: any;
  user_model_state: UserModelState;
  whiteboard_actions?: Array<any>;
}

interface WSMessage {
  type: string;
  data?: any;
  [key: string]: any;
}

// Session context storage (in-memory for Phase 1)
const sessionContexts = new Map<string, TutorContext>();

// Message queue for streaming responses
const messageQueues = new Map<string, Array<any>>();

// Supabase client (simplified for Phase 1)
let supabaseClient: SupabaseClient | null = null;

export function initializeTutorWs(supabase: SupabaseClient) {
  supabaseClient = supabase;
}

// Authentication helper
export async function authenticateWsUser(token: string): Promise<{ userId: string } | null> {
  if (!supabaseClient || !token) return null;
  
  try {
    const { data: { user }, error } = await supabaseClient.auth.getUser(token);
    if (error || !user) return null;
    return { userId: user.id };
  } catch (error) {
    console.error('WS authentication failed:', error);
    return null;
  }
}

// Session context management
export function getOrCreateContext(sessionId: string, userId: string): TutorContext {
  const existing = sessionContexts.get(sessionId);
  if (existing) {
    return existing;
  }

  const newContext: TutorContext = {
    session_id: sessionId,
    user_id: userId,
    interaction_mode: 'chat_and_whiteboard',
    user_model_state: {
      concepts: {},
      overall_progress: 0,
      current_topic: null,
      session_summary: ''
    },
    history: []
  };

  sessionContexts.set(sessionId, newContext);
  return newContext;
}

// Context persistence (simplified for Phase 1)
export async function persistContext(sessionId: string, userId: string, context: TutorContext): Promise<boolean> {
  try {
    // In Phase 1, we'll use simple in-memory storage
    // In Phase 2, this will integrate with Convex
    sessionContexts.set(sessionId, { ...context });
    console.log(`Context persisted for session ${sessionId}`);
    return true;
  } catch (error) {
    console.error(`Failed to persist context for session ${sessionId}:`, error);
    return false;
  }
}

// Message validation
export function validateMessage(message: any): WSMessage | null {
  try {
    if (typeof message !== 'object' || !message.type) {
      return null;
    }
    return message as WSMessage;
  } catch {
    return null;
  }
}

// Safe WebSocket send
export async function safeSendJson(ws: any, data: any, context?: string): Promise<boolean> {
  try {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(JSON.stringify(data));
      return true;
    } else {
      console.warn(`Cannot send message (${context}): WebSocket not open`);
      return false;
    }
  } catch (error) {
    console.error(`Failed to send message (${context}):`, error);
    return false;
  }
}

// Error response helper
export async function sendErrorResponse(
  ws: any,
  message: string,
  errorCode: string,
  details?: string,
  state?: UserModelState
): Promise<void> {
  const errorResponse: InteractionResponseData = {
    content_type: 'error',
    data: {
      response_type: 'error',
      error_message: message,
      error_code: errorCode,
      technical_details: details
    },
    user_model_state: state || {
      concepts: {},
      overall_progress: 0,
      current_topic: null,
      session_summary: ''
    }
  };

  await safeSendJson(ws, errorResponse, `Error Response (${errorCode})`);
}

// Message streaming queue management
export function addToMessageQueue(sessionId: string, message: any): void {
  if (!messageQueues.has(sessionId)) {
    messageQueues.set(sessionId, []);
  }
  messageQueues.get(sessionId)!.push(message);
}

export function flushMessageQueue(sessionId: string, ws: any): void {
  const queue = messageQueues.get(sessionId);
  if (!queue || queue.length === 0) return;

  queue.forEach(message => {
    safeSendJson(ws, message, 'Queue Flush');
  });

  messageQueues.set(sessionId, []);
}

// Core message handler
export async function handleTutorMessage(
  sessionId: string, 
  rawMessage: any, 
  userId: string,
  ws: any
): Promise<void> {
  try {
    console.log(`[TutorWS] Processing message for session ${sessionId}`);
    
    const message = validateMessage(rawMessage);
    if (!message) {
      await sendErrorResponse(ws, 'Invalid message format', 'INVALID_MESSAGE');
      return;
    }

    const context = getOrCreateContext(sessionId, userId);
    
    // Handle different message types
    switch (message.type) {
      case 'ping':
      case 'system_tick':
        console.log(`[TutorWS] System message ignored: ${message.type}`);
        return;
        
      case 'heartbeat':
        await safeSendJson(ws, { 
          type: 'heartbeat_ack', 
          timestamp: Date.now() 
        }, 'Heartbeat Response');
        return;
        
      case 'user_message':
        await handleUserMessage(sessionId, message, context, ws);
        break;
        
      case 'answer':
        await handleAnswerSubmission(sessionId, message, context, ws);
        break;
        
      case 'next':
      case 'previous':
      case 'summary':
      case 'start':
        await handlePedagogicalAction(sessionId, message, context, ws);
        break;
        
      case 'canvas_click':
        await handleCanvasClick(sessionId, message, context, ws);
        break;
        
      case 'end_session':
        await handleEndSession(sessionId, message, context, ws);
        break;
        
      case 'BOARD_STATE_RESPONSE':
        await handleBoardStateResponse(sessionId, message, context, ws);
        break;
        
      default:
        console.warn(`[TutorWS] Unknown message type: ${message.type}`);
        await sendErrorResponse(ws, `Unknown message type: ${message.type}`, 'UNKNOWN_MESSAGE_TYPE');
    }
    
    // Persist context after processing
    await persistContext(sessionId, userId, context);
    
  } catch (error) {
    console.error(`[TutorWS] Error handling message for session ${sessionId}:`, error);
    await sendErrorResponse(ws, 'Internal server error', 'INTERNAL_ERROR', error?.toString());
  }
}

// Individual message handlers
async function handleUserMessage(sessionId: string, message: WSMessage, context: TutorContext, ws: any): Promise<void> {
  const userText = message.data?.text || '';
  if (!userText.trim()) {
    await sendErrorResponse(ws, 'Empty message text', 'EMPTY_MESSAGE');
    return;
  }

  // Add to conversation history
  context.history.push({ role: 'user', content: userText });
  
  // For Phase 1, send a simple acknowledgment
  // In Phase 2+, this will trigger AI agent processing
  const response: InteractionResponseData = {
    content_type: 'message',
    data: {
      response_type: 'message',
      text: `Message received: "${userText}". AI processing will be implemented in Phase 3.`
    },
    user_model_state: context.user_model_state
  };

  await safeSendJson(ws, response, 'User Message Response');
  console.log(`[TutorWS] User message processed for session ${sessionId}`);
}

async function handleAnswerSubmission(sessionId: string, message: WSMessage, context: TutorContext, ws: any): Promise<void> {
  // Add answer to history
  context.history.push({ role: 'user', content: JSON.stringify(message) });
  
  const response: InteractionResponseData = {
    content_type: 'feedback',
    data: {
      response_type: 'feedback',
      feedback_text: 'Answer received. Evaluation will be implemented in Phase 3.',
      is_correct: null
    },
    user_model_state: context.user_model_state
  };

  await safeSendJson(ws, response, 'Answer Submission Response');
  console.log(`[TutorWS] Answer submission processed for session ${sessionId}`);
}

async function handlePedagogicalAction(sessionId: string, message: WSMessage, context: TutorContext, ws: any): Promise<void> {
  context.last_pedagogical_action = message.type;
  context.history.push({ role: 'user', content: message.type });
  
  const response: InteractionResponseData = {
    content_type: 'message',
    data: {
      response_type: 'message',
      text: `Pedagogical action "${message.type}" received. Processing will be implemented in Phase 3.`
    },
    user_model_state: context.user_model_state
  };

  await safeSendJson(ws, response, 'Pedagogical Action Response');
  console.log(`[TutorWS] Pedagogical action "${message.type}" processed for session ${sessionId}`);
}

async function handleCanvasClick(sessionId: string, message: WSMessage, context: TutorContext, ws: any): Promise<void> {
  const objectId = message.data?.object_id;
  if (!objectId) {
    await sendErrorResponse(ws, 'Canvas click missing object_id', 'CANVAS_CLICK_NO_ID');
    return;
  }

  const clickEvent = { type: 'canvas_click', object_id: objectId };
  context.history.push({ role: 'user', content: JSON.stringify(clickEvent) });
  
  const response: InteractionResponseData = {
    content_type: 'message',
    data: {
      response_type: 'message',
      text: `Canvas click on "${objectId}" received. Interaction will be implemented in Phase 3.`
    },
    user_model_state: context.user_model_state
  };

  await safeSendJson(ws, response, 'Canvas Click Response');
  console.log(`[TutorWS] Canvas click on "${objectId}" processed for session ${sessionId}`);
}

async function handleEndSession(sessionId: string, message: WSMessage, context: TutorContext, ws: any): Promise<void> {
  console.log(`[TutorWS] End session request for ${sessionId}`);
  
  const response: InteractionResponseData = {
    content_type: 'message',
    data: {
      response_type: 'message',
      text: 'Session ending acknowledged. Analysis will be implemented in Phase 4.'
    },
    user_model_state: context.user_model_state
  };

  await safeSendJson(ws, response, 'End Session Response');
  
  // Clean up session data
  sessionContexts.delete(sessionId);
  messageQueues.delete(sessionId);
  
  // Close connection gracefully
  if (ws.readyState === 1) {
    ws.close(1000, 'Session ended by user');
  }
  
  console.log(`[TutorWS] Session ${sessionId} ended and cleaned up`);
}

async function handleBoardStateResponse(sessionId: string, message: WSMessage, context: TutorContext, ws: any): Promise<void> {
  const requestId = message.request_id;
  const boardData = message.payload;
  
  if (!requestId) {
    console.warn(`[TutorWS] BOARD_STATE_RESPONSE missing request_id for session ${sessionId}`);
    return;
  }
  
  // For Phase 1, just log the response
  // In Phase 3+, this will integrate with AI tools that request board state
  console.log(`[TutorWS] Board state response received for session ${sessionId}, request ${requestId}`);
}

// Session cleanup
export function cleanupTutorSession(sessionId: string): void {
  sessionContexts.delete(sessionId);
  messageQueues.delete(sessionId);
  console.log(`[TutorWS] Cleaned up tutor session ${sessionId}`);
}

// Initial state hydration (simplified for Phase 1)
export async function hydrateInitialState(sessionId: string, userId: string, ws: any): Promise<void> {
  try {
    const context = getOrCreateContext(sessionId, userId);
    
    // Send initial state acknowledgment
    const initialResponse: InteractionResponseData = {
      content_type: 'message',
      data: {
        response_type: 'message',
        text: 'Tutor session initialized. Full state hydration will be implemented in Phase 2.'
      },
      user_model_state: context.user_model_state
    };

    await safeSendJson(ws, initialResponse, 'Initial State');
    console.log(`[TutorWS] Initial state sent for session ${sessionId}`);
    
  } catch (error) {
    console.error(`[TutorWS] Failed to hydrate initial state for session ${sessionId}:`, error);
    await sendErrorResponse(ws, 'Failed to load session state', 'INITIAL_STATE_ERROR');
  }
}

// Update interaction mode
export function updateInteractionMode(sessionId: string, mode: 'chat_only' | 'chat_and_whiteboard'): boolean {
  const context = sessionContexts.get(sessionId);
  if (!context) return false;
  
  context.interaction_mode = mode;
  console.log(`[TutorWS] Updated interaction mode for session ${sessionId} to ${mode}`);
  return true;
}

// Get session metrics
export function getSessionMetrics() {
  return {
    activeSessions: sessionContexts.size,
    activeQueues: messageQueues.size,
    timestamp: Date.now()
  };
} 