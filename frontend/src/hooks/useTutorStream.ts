import { useEffect, useRef, useCallback, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from 'convex_generated/api';
import { useAuthToken } from '@convex-dev/auth/react';
import { TutorInteractionResponse, WhiteboardAction } from '@/lib/types';
import { Id } from 'convex_generated/dataModel';
import { useThreadMessages, useSmoothText, optimisticallySendMessage, toUIMessages } from "@convex-dev/agent/react";

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
  loadingState: 'idle' | 'loading' | 'streaming' | 'connecting' | 'error';
  loadingMessage: string;
}

/**
 * Enhanced tutor stream hook using Convex agent streaming instead of WebSocket
 * - Uses Convex agent component for AI responses
 * - Real-time message synchronization
 * - Automatic vector store creation and knowledge base generation
 */
export function useTutorStream(
  sessionId: string,
  handlers: TutorStreamHandlers = {}
) {
  const jwt = useAuthToken();
  const isComponentMountedRef = useRef(true);
  
  // Agent streaming functions
  const getOrCreateThread = useMutation(api.functions.getOrCreateSessionThread);
  const sendStreamingMessage = useMutation(api.functions.sendStreamingMessage);
  
  // Local state for streaming and session info
  const [sessionState, setSessionState] = useState<SessionState>({
    messages: [],
    userModelState: {},
    focusObjective: null,
    loadingState: 'idle',
    loadingMessage: ''
  });
  
  const [threadId, setThreadId] = useState<string | null>(null);

  // Initialize agent thread for this session
  useEffect(() => {
    if (sessionId && !threadId) {
      console.log('[useTutorStream] Initializing agent thread for session:', sessionId);
      setSessionState(prev => ({ ...prev, loadingState: 'connecting' }));
      
      getOrCreateThread({ sessionId: sessionId as Id<"sessions"> })
        .then((newThreadId) => {
          console.log('[useTutorStream] Agent thread created:', newThreadId);
          setThreadId(newThreadId);
          setSessionState(prev => ({ ...prev, loadingState: 'idle' }));
        })
        .catch((error) => {
          console.error('[useTutorStream] Failed to create agent thread:', error);
          setSessionState(prev => ({ 
            ...prev, 
            loadingState: 'error',
            loadingMessage: 'Failed to initialize AI tutor'
          }));
          handlers.onError?.('Failed to initialize AI tutor');
        });
    }
  }, [sessionId, threadId, getOrCreateThread, handlers]);

  // Use Convex agent thread messages with streaming
  const agentMessages = useThreadMessages(
    api.functions.listThreadMessages,
    threadId ? { threadId } : "skip",
    { 
      initialNumItems: 20,
      stream: true,
    }
  );

  // Convert agent messages to UI format
  const uiMessages = agentMessages.results ? toUIMessages(agentMessages.results) : [];

  // Sync agent messages to local state
  useEffect(() => {
    if (uiMessages) {
      const transformedMessages: ChatMessage[] = uiMessages.map((msg: any, index: number) => ({
        id: msg.key || `msg-${index}`,
        role: msg.role as 'user' | 'assistant',
        content: msg.content || '',
        interaction: msg.metadata as TutorInteractionResponse,
        whiteboard_actions: msg.metadata?.whiteboard_actions,
        createdAt: Date.now(), // Agent messages don't have timestamps
        isStreaming: msg.isStreaming || false
      }));
      
      setSessionState(prev => ({
        ...prev,
        messages: transformedMessages,
        loadingState: prev.loadingState === 'loading' ? 'idle' : prev.loadingState
      }));

      // Call message handler for new messages
      const prevLength = sessionState.messages.length;
      if (transformedMessages.length > prevLength) {
        const newMessages = transformedMessages.slice(prevLength);
        newMessages.forEach(message => {
          handlers.onMessage?.(message);
          
          // Handle whiteboard actions
          if (message.whiteboard_actions) {
            handlers.onWhiteboardAction?.(message.whiteboard_actions);
          }
        });
      }
    }
  }, [uiMessages, handlers]);

  // Set up optimistic message sending with agent streaming
  const sendMessageWithOptimistic = useMutation(api.functions.sendStreamingMessage);

  // Send user message using Convex agent streaming
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    if (!threadId) {
      console.warn('[useTutorStream] No thread ID available');
      handlers.onError?.('AI tutor not ready');
      return;
    }

    try {
      console.log('[useTutorStream] Sending message to agent:', text);
      
      setSessionState(prev => ({ 
        ...prev, 
        loadingState: 'streaming',
        loadingMessage: 'AI is thinking...'
      }));

      // Send message to agent with optimistic updates
      await sendMessageWithOptimistic({
        threadId,
        message: text.trim(),
        sessionId: sessionId as Id<"sessions">
      });

      console.log('[useTutorStream] Message sent to agent successfully');

    } catch (error) {
      console.error('[useTutorStream] Failed to send message:', error);
      setSessionState(prev => ({ ...prev, loadingState: 'error' }));
      handlers.onError?.('Failed to send message');
    }
  }, [sessionId, threadId, sendMessageWithOptimistic, handlers]);

  // Trigger AI response for interaction types
  const triggerAIResponse = useCallback(async (interactionType: string, data?: any) => {
    if (!threadId) {
      console.warn('[useTutorStream] No thread ID available for interaction');
      return;
    }

    try {
      console.log('[useTutorStream] Triggering AI interaction:', interactionType);
      
      setSessionState(prev => ({ 
        ...prev, 
        loadingState: 'streaming',
        loadingMessage: 'Processing interaction...'
      }));

      // Create interaction message for the agent
      const interactionMessage = `User interaction: ${interactionType}${data ? ` with data: ${JSON.stringify(data)}` : ''}`;
      
      await sendMessageWithOptimistic({
        threadId,
        message: interactionMessage,
        sessionId: sessionId as Id<"sessions">
      });

    } catch (error) {
      console.error('[useTutorStream] Failed to trigger AI response:', error);
      setSessionState(prev => ({ ...prev, loadingState: 'error' }));
      handlers.onError?.('Failed to process interaction');
    }
  }, [threadId, sessionId, sendStreamingMessage, handlers]);

  // Send interaction (next, start, answer, etc.)
  const sendInteraction = useCallback(async (
    type: 'start' | 'next' | 'answer' | 'summary' | 'previous',
    data?: Record<string, any>
  ) => {
    console.log(`[useTutorStream] Sending interaction: ${type}`, data);
    
    const interactionPrompt = generateInteractionPrompt(type, data);
    await triggerAIResponse(type, data);
  }, [triggerAIResponse]);

  // Cleanup on unmount
  useEffect(() => {
    isComponentMountedRef.current = true;
    return () => {
      isComponentMountedRef.current = false;
    };
  }, []);

  return {
    ...sessionState,
    sendMessage,
    sendInteraction,
    triggerAIResponse,
    isConnected: threadId !== null && sessionState.loadingState !== 'error',
    threadId
  };
}

// Helper function to generate prompts for different interaction types
function generateInteractionPrompt(type: string, data?: any): string {
  switch (type) {
    case 'start':
      return 'Please start the tutoring session. Introduce the topic and begin with an engaging question or explanation.';
    case 'next':
      return 'Continue to the next part of the lesson. Move forward with the learning progression.';
    case 'answer':
      return data?.answer 
        ? `User answered: ${data.answer}. Please provide feedback and continue the lesson.`
        : 'User provided an answer. Please provide feedback and continue.';
    case 'summary':
      return 'Please provide a summary of what we have learned so far in this session.';
    case 'previous':
      return 'Go back to the previous topic or question in the lesson.';
    default:
      return `Handle interaction type: ${type}`;
  }
} 