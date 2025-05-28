import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useSessionStore } from '@/store/sessionStore';
import { useAuthToken } from '@convex-dev/auth/react';
import { TutorInteractionResponse, WhiteboardAction } from '@/lib/types';
import { Id } from '../../convex/_generated/dataModel';

// Define ChatMessage interface locally since it's not in the main types file
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  interaction?: TutorInteractionResponse;
  whiteboard_actions?: WhiteboardAction[];
  createdAt?: number;
  isStreaming?: boolean;
}

interface TutorStreamHandlers {
  onMessage?: (message: ChatMessage) => void;
  onRawResponse?: (delta: string) => void;
  onWhiteboardAction?: (actions: WhiteboardAction[]) => void;
  onError?: (error: string) => void;
}

interface SessionState {
  messages: ChatMessage[];
  userModelState: any;
  focusObjective: any;
  loadingState: 'idle' | 'loading' | 'streaming';
  loadingMessage: string;
}

/**
 * Enhanced tutor stream hook that combines:
 * - Convex for persistent chat message storage and real-time sync
 * - Minimal WebSocket for AI response streaming
 * - Real-time updates when messages are added by other clients
 */
export function useTutorStream(
  sessionId: string,
  handlers: TutorStreamHandlers = {}
) {
  const jwt = useAuthToken();
  const wsRef = useRef<WebSocket | null>(null);
  const isComponentMountedRef = useRef(true);
  
  // Convex integration for persistent messages
  const sessionMessages = useQuery(
    api.getSessionMessages,
    sessionId ? { sessionId: sessionId as Id<"sessions"> } : 'skip'
  );
  
  // Using the newly created addSessionMessage function
  const addMessage = useMutation(api.addSessionMessage);
  
  // Local state for streaming and session info
  const [sessionState, setSessionState] = useState<SessionState>({
    messages: [],
    userModelState: {},
    focusObjective: null,
    loadingState: 'idle',
    loadingMessage: ''
  });
  
  const [streamingMessage, setStreamingMessage] = useState<{
    id: string;
    content: string;
    isComplete: boolean;
  } | null>(null);

  // Sync Convex messages to local state
  useEffect(() => {
    if (sessionMessages) {
      const transformedMessages: ChatMessage[] = sessionMessages.map((msg: any) => ({
        id: msg._id,
        role: msg.role as 'user' | 'assistant',
        content: msg.text || '',
        interaction: msg.payload_json as TutorInteractionResponse,
        whiteboard_actions: msg.payload_json?.whiteboard_actions,
        createdAt: msg.created_at
      }));
      
      setSessionState(prev => ({
        ...prev,
        messages: transformedMessages,
        loadingState: prev.loadingState === 'loading' ? 'idle' : prev.loadingState
      }));
    }
  }, [sessionMessages]);

  // Connect to tutor WebSocket for streaming
  const connect = useCallback(() => {
    if (!isComponentMountedRef.current || !sessionId || !jwt) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    const wsOrigin = process.env.NEXT_PUBLIC_BACKEND_WS_ORIGIN || 'ws://localhost:8080';
    const wsUrl = `${wsOrigin}/ws/tutor/${sessionId}?token=${jwt}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[useTutorStream] Connected to tutor WebSocket');
      setSessionState(prev => ({ ...prev, loadingState: 'idle' }));
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws || !isComponentMountedRef.current) return;

      try {
        const parsedData = JSON.parse(event.data);

        // Handle heartbeat
        if (parsedData?.type === 'heartbeat_ack') {
          console.debug('[useTutorStream] Heartbeat ack received');
          return;
        }

        // Handle streaming AI response deltas
        if (parsedData?.type === 'AI_STREAM_DELTA') {
          const delta = parsedData.delta;
          const isComplete = parsedData.isComplete;
          
          setStreamingMessage(prev => {
            const newContent = (prev?.content || '') + delta;
            return {
              id: prev?.id || `stream-${Date.now()}`,
              content: newContent,
              isComplete
            };
          });
          
          handlers.onRawResponse?.(delta);
          
          // If complete, persist to Convex
          if (isComplete) {
            const finalContent = (streamingMessage?.content || '') + delta;
            if (finalContent.trim()) {
              addMessage({
                sessionId: sessionId as Id<"sessions">,
                role: 'assistant',
                text: finalContent,
                payloadJson: {
                  response_type: 'message',
                  text: finalContent
                }
              }).then(() => {
                setStreamingMessage(null);
                setSessionState(prev => ({ ...prev, loadingState: 'idle' }));
              }).catch(error => {
                console.error('[useTutorStream] Failed to persist streamed message:', error);
                handlers.onError?.('Failed to save message');
                setSessionState(prev => ({ ...prev, loadingState: 'idle' }));
              });
            } else {
              setStreamingMessage(null);
              setSessionState(prev => ({ ...prev, loadingState: 'idle' }));
            }
          }
          return;
        }

        // Handle AI streaming errors
        if (parsedData?.type === 'AI_STREAM_ERROR') {
          console.error('[useTutorStream] AI streaming error:', parsedData.error);
          setStreamingMessage(null);
          setSessionState(prev => ({ ...prev, loadingState: 'idle' }));
          handlers.onError?.(parsedData.error || 'AI service error');
          return;
        }

        // Handle tutor connection acknowledgment
        if (parsedData?.type === 'TUTOR_CONNECTED') {
          console.log('[useTutorStream] Tutor connection established');
          return;
        }

        // Handle complete interaction responses (for complex interactions)
        if (parsedData?.content_type && parsedData?.data) {
          const message: ChatMessage = {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: parsedData.data.text || parsedData.data.explanation_text || 'Response received',
            interaction: parsedData.data as TutorInteractionResponse,
            whiteboard_actions: parsedData.whiteboard_actions
          };

          // Persist to Convex
          addMessage({
            sessionId: sessionId as Id<"sessions">,
            role: 'assistant',
            text: message.content,
            payloadJson: parsedData
          }).catch(error => {
            console.error('[useTutorStream] Failed to persist interaction:', error);
          });

          // Handle whiteboard actions
          if (parsedData.whiteboard_actions) {
            handlers.onWhiteboardAction?.(parsedData.whiteboard_actions);
          }

          handlers.onMessage?.(message);
          return;
        }

        // Handle user message confirmations
        if (parsedData?.type === 'USER_MESSAGE_RECEIVED') {
          console.log('[useTutorStream] User message confirmed by server');
          return;
        }

        console.warn('[useTutorStream] Unknown message type:', parsedData?.type);

      } catch (error) {
        console.error('[useTutorStream] Failed to parse WebSocket message:', error);
        handlers.onError?.('Failed to parse server response');
      }
    };

    ws.onclose = () => {
      console.log('[useTutorStream] Tutor WebSocket closed');
      setSessionState(prev => ({ ...prev, loadingState: 'idle' }));
    };

    ws.onerror = (error) => {
      console.error('[useTutorStream] Tutor WebSocket error:', error);
      setSessionState(prev => ({ ...prev, loadingState: 'idle' }));
      handlers.onError?.('Connection error');
    };

  }, [sessionId, jwt, handlers, addMessage, streamingMessage]);

  // Auto-connect when dependencies change
  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Send user message
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    try {
      // Persist user message to Convex immediately
      await addMessage({
        sessionId: sessionId as Id<"sessions">,
        role: 'user',
        text: text.trim(),
        payloadJson: { text: text.trim() }
      });

      // Send to WebSocket for AI processing
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'USER_MESSAGE',
          text: text.trim(),
          timestamp: Date.now()
        }));

        setSessionState(prev => ({ 
          ...prev, 
          loadingState: 'streaming',
          loadingMessage: 'AI is thinking...'
        }));
      } else {
        console.warn('[useTutorStream] WebSocket not connected');
        handlers.onError?.('Not connected to tutor service');
      }

    } catch (error) {
      console.error('[useTutorStream] Failed to send message:', error);
      handlers.onError?.('Failed to send message');
    }
  }, [sessionId, addMessage, handlers]);

  // Trigger AI response for a given prompt
  const triggerAIResponse = useCallback(async (prompt: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[useTutorStream] WebSocket not connected for AI response');
      return;
    }

    try {
      wsRef.current.send(JSON.stringify({
        type: 'STREAM_AI_RESPONSE',
        prompt,
        timestamp: Date.now()
      }));

      setSessionState(prev => ({ 
        ...prev, 
        loadingState: 'streaming',
        loadingMessage: 'Generating response...'
      }));

    } catch (error) {
      console.error('[useTutorStream] Failed to trigger AI response:', error);
      handlers.onError?.('Failed to trigger AI response');
    }
  }, [handlers]);

  // Send heartbeat
  const sendHeartbeat = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'heartbeat' }));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isComponentMountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Combine persistent messages with streaming message
  const allMessages = useMemo(() => {
    const messages = [...sessionState.messages];
    
    // Add streaming message if active
    if (streamingMessage && !streamingMessage.isComplete) {
      messages.push({
        id: streamingMessage.id,
        role: 'assistant' as const,
        content: streamingMessage.content,
        isStreaming: true
      });
    }
    
    return messages;
  }, [sessionState.messages, streamingMessage]);

  return {
    // State
    sessionState: {
      ...sessionState,
      messages: allMessages
    },
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    isStreaming: streamingMessage !== null && !streamingMessage.isComplete,
    
    // Actions
    sendMessage,
    triggerAIResponse,
    sendHeartbeat,
    connect,
    
    // Raw WebSocket access for advanced use cases
    ws: wsRef.current
  };
} 