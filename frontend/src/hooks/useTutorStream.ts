import { useEffect, useRef, useCallback, useState } from 'react';
import { useQuery, useMutation, usePaginatedQuery } from 'convex/react';
import { api } from 'convex_generated/api';
import { useAuthToken } from '@convex-dev/auth/react';
import { TutorInteractionResponse, WhiteboardAction } from '@/lib/types';
import { Id } from 'convex_generated/dataModel';

// Define ChatMessage interface locally since it's not in the main types file
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  interaction?: TutorInteractionResponse;
  whiteboard_actions?: WhiteboardAction[];
  createdAt?: number;
  isStreaming?: boolean;
  isInternal?: boolean;
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

// Helper function to generate prompts for different interaction types
function generateInteractionPrompt(type: string, data?: any): string {
  switch (type) {
    case 'plan_and_start':
      return `INTERNAL_PLANNER_MESSAGE: Initialize two-agent learning session

You are the Planner Agent. Your task is to:
1. ANALYZE the knowledge base from uploaded materials
2. IDENTIFY key learning objectives and concepts  
3. CREATE a lesson plan with focus objectives
4. HANDOFF to the Executor Agent with instructions

After analysis, you must hand off to the Executor Agent who will:
- Start the actual tutoring session
- Welcome the student with an engaging introduction
- Begin teaching based on your plan
- Use a conversational, encouraging tone

IMPORTANT: Your planning message should be INTERNAL ONLY and not shown to the student. The first visible message should be from the Executor Agent welcoming the student.

Analyze the knowledge base and create the handoff instructions now.`;
    case 'start':
      return `You are an AI tutor starting a new learning session. Your role is to:

1. **ANALYZE THE KNOWLEDGE BASE**: Review the uploaded materials to understand what the student needs to learn
2. **PLAN THE SESSION**: Determine the most important topic to focus on based on the content
3. **WELCOME THE STUDENT**: Provide a warm, engaging introduction
4. **START TEACHING**: Begin with the most fundamental concept or an engaging question

Please:
- Analyze the knowledge base from the uploaded materials
- Identify the key learning objectives 
- Choose the most important topic to start with
- Provide a clear, engaging introduction
- Ask a thought-provoking question or present an interesting fact to begin
- Use a conversational, encouraging tone

Start the tutoring session now.`;
    case 'next':
      return 'Continue to the next part of the lesson. Move forward with the learning progression based on the student\'s understanding.';
    case 'answer':
      if (data?.answer_index !== undefined) {
        return `User selected answer option ${data.answer_index}. Please provide feedback and continue the lesson.`;
      }
      return data?.answer 
        ? `User answered: ${data.answer}. Please provide feedback and continue the lesson.`
        : 'User provided an answer. Please provide feedback and continue.';
    case 'summary':
      return 'Please provide a summary of what we have learned so far in this session.';
    case 'previous':
      return 'Go back to the previous topic or question in the lesson.';
    case 'end_session':
      return 'The user wants to end the tutoring session. Please provide a closing summary and goodbye message.';
    default:
      return `Handle interaction type: ${type}`;
  }
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
  }, [threadId, sessionId, sendMessageWithOptimistic, handlers]);

  // Send interaction (next, start, answer, etc.)
  const sendInteraction = useCallback(async (
    type: 'start' | 'next' | 'answer' | 'summary' | 'previous' | 'user_message' | 'end_session' | 'plan_and_start',
    data?: Record<string, any>
  ) => {
    console.log(`[useTutorStream] Sending interaction: ${type}`, data);
    
    if (type === 'user_message' && data?.text) {
      // Handle user message directly
      await sendMessage(data.text);
    } else {
      // Generate the appropriate prompt for this interaction type
      const interactionPrompt = generateInteractionPrompt(type, data);
      // Send the prompt directly to the AI
      await sendMessage(interactionPrompt);
    }
  }, [sendMessage]);

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

  // Use our existing Convex streaming function
  const agentMessages = usePaginatedQuery(
    api.functions.listThreadMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 20 }
  );

  // Convert agent messages to UI format  
  const uiMessages = agentMessages?.results || [];

  // Sync agent messages to local state
  useEffect(() => {
    if (uiMessages && uiMessages.length > 0) {
      const allTransformedMessages: ChatMessage[] = uiMessages.map((msg: any, index: number) => {
        // Agent messages have the structure: { message: { role, content }, text, ... }
        // Extract role from message.role or default to 'assistant' for responses
        let role: 'user' | 'assistant' = 'assistant';
        let content = '';
        
        if (msg.message?.role) {
          role = msg.message.role as 'user' | 'assistant';
          content = msg.message.content || msg.text || '';
        } else {
          // Fallback: use text field and default to assistant role
          content = msg.text || msg.content || '';
          // If content looks like a user message prompt, mark as user
          if (content.includes('You are an AI tutor') || content.includes('User interaction:') || content.includes('INTERNAL_PLANNER_MESSAGE')) {
            role = 'user';
          }
        }

        // Filter out internal planner messages from being shown to the user
        const isInternalMessage = content.includes('INTERNAL_PLANNER_MESSAGE') || 
                                  content.includes('INTERNAL_SYSTEM_MESSAGE') ||
                                  content.includes('EXECUTOR_START:') ||
                                  content.includes('HANDOFF_TO_EXECUTOR:') ||
                                  (role === 'user' && content.includes('You are the Planner Agent')) ||
                                  (role === 'assistant' && content.includes('HANDOFF_TO_EXECUTOR:'));

        return {
          id: msg._id || `msg-${index}`,
          role,
          content,
          interaction: msg.metadata as TutorInteractionResponse,
          whiteboard_actions: msg.whiteboard_actions,
          createdAt: msg._creationTime || Date.now(),
          isStreaming: msg.streaming || false,
          isInternal: isInternalMessage
        };
      });
      
      // Filter out internal messages for user display
      const transformedMessages = allTransformedMessages.filter(msg => !msg.isInternal);
      
      setSessionState(prev => ({
        ...prev,
        messages: transformedMessages,
        loadingState: prev.loadingState === 'loading' ? 'idle' : prev.loadingState
      }));

      // Call message handler for new messages (only non-internal ones)
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

  // Auto-start the session once thread is ready (separate effect to avoid circular dependency)
  const [hasAutoStarted, setHasAutoStarted] = useState(false);
  const [hasExecutorStarted, setHasExecutorStarted] = useState(false);
  
  useEffect(() => {
    if (threadId && !hasAutoStarted && sessionState.loadingState === 'idle') {
      console.log('[useTutorStream] Auto-starting tutoring session...');
      setHasAutoStarted(true);
      
      // Set loading state to indicate lesson planner is working
      setSessionState(prev => ({ 
        ...prev, 
        loadingState: 'streaming',
        loadingMessage: 'Analyzing knowledge base and creating lesson plan...'
      }));
      
      // Small delay to ensure everything is ready
      setTimeout(() => {
        sendInteraction('plan_and_start');
      }, 1000);
    }
  }, [threadId, hasAutoStarted, sessionState.loadingState, sendInteraction]);

  // Check if executor has started (first non-internal message from assistant)
  useEffect(() => {
    if (sessionState.messages.length > 0 && !hasExecutorStarted) {
      const firstAssistantMessage = sessionState.messages.find(msg => 
        msg.role === 'assistant' && !msg.isInternal
      );
      
      if (firstAssistantMessage) {
        console.log('[useTutorStream] Executor agent has started, showing interface');
        setHasExecutorStarted(true);
        setSessionState(prev => ({ 
          ...prev, 
          loadingState: 'idle',
          loadingMessage: ''
        }));
      }
    }
  }, [sessionState.messages, hasExecutorStarted]);

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
    threadId,
    hasExecutorStarted,
    latency: null // Placeholder for compatibility
  };
} 