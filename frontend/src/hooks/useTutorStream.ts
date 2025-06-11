import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuthToken } from '@convex-dev/auth/react';
import { useThreadMessages, toUIMessages, optimisticallySendMessage, type UIMessage } from '@convex-dev/agent/react';
import { TutorInteractionResponse, WhiteboardAction } from '@/lib/types';
import { Id } from '../../../convex/_generated/dataModel';
import { useSessionStore } from '@/store/sessionStore';

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
      return `INTERNAL_PLANNER_MESSAGE: Start AI tutoring session

Please analyze the uploaded knowledge base materials and start the tutoring session immediately. Welcome the student and begin teaching the key concepts from the uploaded content.`;
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
 * Enhanced tutor stream hook using Convex agent streaming with proper streaming support
 * - Uses Convex agent component for AI responses
 * - Real-time message synchronization with streaming
 * - Automatic vector store creation and knowledge base generation
 */
export function useTutorStream(
  sessionId: string,
  handlers: TutorStreamHandlers = {}
) {
  // Use ref to store handlers to avoid effect dependencies
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const jwt = useAuthToken();
  const isComponentMountedRef = useRef(true);
  
  // Agent streaming functions
  const getOrCreateThread = useMutation(api.functions.getOrCreateSessionThread);
  
  // Local state for streaming and session info
  const [sessionState, setSessionState] = useState<SessionState>({
    messages: [],
    userModelState: null,
    focusObjective: null,
    loadingState: 'idle',
    loadingMessage: ''
  });
  
  const [threadId, setThreadId] = useState<string | null>(null);
  const [hasAutoStarted, setHasAutoStarted] = useState(false);
  const [hasTutorStarted, setHasTutorStarted] = useState(false);

  // Set up proper Convex Agent streaming with useThreadMessages
  const agentMessages = useThreadMessages(
    api.functions.listThreadMessages,
    threadId ? { threadId } : "skip",
    { 
      initialNumItems: 50,
      stream: true 
    }
  );

  // Set up message sending with agent streaming
  const sendMessageMutation = useMutation(api.functions.sendStreamingMessage);

  // Send user message using Convex agent streaming
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    if (!threadId) {
      console.warn('[useTutorStream] No thread ID available');
              handlersRef.current.onError?.('AI tutor not ready');
      return;
    }

    try {
      console.log('[useTutorStream] Sending message to agent:', text);
      console.log('[useTutorStream] Auth token available:', !!jwt);
      console.log('[useTutorStream] ThreadId:', threadId);
      console.log('[useTutorStream] SessionId:', sessionId);
      
      setSessionState(prev => ({ 
        ...prev, 
        loadingState: 'streaming',
        loadingMessage: 'AI is thinking...'
      }));

      // Send message to agent
      await sendMessageMutation({
        threadId,
        message: text.trim(),
        sessionId: sessionId as Id<"sessions">
      });

      console.log('[useTutorStream] Message sent to agent successfully');

    } catch (error) {
      console.error('[useTutorStream] Failed to send message:', error);
      setSessionState(prev => ({ ...prev, loadingState: 'error' }));
              handlersRef.current.onError?.('Failed to send message');
    }
  }, [sessionId, threadId, sendMessageMutation, jwt]);

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

  // Trigger AI response for interaction types (deprecated - use sendInteraction instead)
  const triggerAIResponse = useCallback(async (interactionType: string, data?: any) => {
    await sendInteraction(interactionType as any, data);
  }, [sendInteraction]);

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
          handlersRef.current.onError?.('Failed to initialize AI tutor');
        });
    }
  }, [sessionId, threadId, getOrCreateThread]);

  // Convert agent messages to UI format and sync to local state
  const previousResultsRef = useRef<{results: any[], converted?: UIMessage[]}>({results: []});
  
  const uiMessages = useMemo(() => {
    try {
      if (!agentMessages?.results) {
        console.log('[useTutorStream] No agent messages results available');
        return [];
      }
      
      // Check if the results actually changed (deep comparison of content)
      const currentResults = agentMessages.results;
      const previousResults = previousResultsRef.current.results;
      
      // Simple change detection based on length and last message content
      if (currentResults.length === previousResults.length && currentResults.length > 0) {
        const lastCurrent = currentResults[currentResults.length - 1];
        const lastPrevious = previousResults[previousResults.length - 1];
        
        if (lastCurrent?.message?.content === lastPrevious?.message?.content &&
            lastCurrent?.streaming === lastPrevious?.streaming) {
          console.log('[useTutorStream] Agent messages unchanged, returning cached result');
          return previousResultsRef.current.converted || [];
        }
      }
      
      console.log('[useTutorStream] Processing agent messages:', agentMessages.results.length);
      
      const validMessages = agentMessages.results.filter(msg => {
        if (!msg.message || msg.message.content == null) return false;
        
        // Handle empty array content
        if (Array.isArray(msg.message.content) && msg.message.content.length === 0) {
          return false;
        }
        
        return true;
      });
      
      console.log('[useTutorStream] Valid messages after filtering:', validMessages.length);
      
      const converted = toUIMessages(validMessages);
      console.log('[useTutorStream] Converted UI messages:', converted.length);
      
      // Cache the results
      previousResultsRef.current = {
        results: currentResults,
        converted: converted
      };
      
      return converted;
    } catch (error) {
      console.error('[useTutorStream] Error converting messages to UI format:', error);
      return [];
    }
  }, [agentMessages?.results]);

  // Track previous message count to detect new messages
  const prevMessageCountRef = useRef(0);
  const lastMessageHashRef = useRef('');
  const messageIdMapRef = useRef(new Map<string, string>());
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // Clear any pending updates
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    // Debounce the message processing to prevent rapid-fire updates
    updateTimeoutRef.current = setTimeout(() => {
      // Check if component is still mounted
      if (!isComponentMountedRef.current) {
        return;
      }
      
      if (uiMessages && uiMessages.length > 0) {
        const allTransformedMessages: ChatMessage[] = uiMessages.map((msg: UIMessage, index: number) => {
          // Extract role and content from UI message format
          const role = msg.role as 'user' | 'assistant';
          const content = msg.content || '';

          // Debug: Log all message content to understand what we're receiving
          console.log('[useTutorStream] Processing message:', {
            role,
            content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
            fullLength: content.length
          });

          // Filter out internal planner messages from being shown to the user
          // Only filter messages that are truly internal system communications
          const isInternalMessage = (
            // User messages that are internal system prompts
            (role === 'user' && (
              content.includes('INTERNAL_PLANNER_MESSAGE') || 
              content.includes('INTERNAL_SYSTEM_MESSAGE') ||
              content.includes('You are the Planner Agent') ||
              content.includes('EXECUTOR_START:')
            )) ||
            // Assistant messages that are purely internal handoffs (not student-facing)
            (role === 'assistant' && content.startsWith('INTERNAL_PLANNER_MESSAGE:') && content.includes('HANDOFF_TO_EXECUTOR:'))
          );

          console.log('[useTutorStream] Message internal check:', {
            content: content.substring(0, 50) + '...',
            isInternal: isInternalMessage,
            role: role
          });

          // Create stable ID for this message based on content and position
          const messageKey = msg.key || msg.id;
          let stableId: string;
          
          if (messageKey) {
            stableId = messageKey;
          } else {
            // Create a deterministic ID based on message content and position
            const contentHash = content.substring(0, 100) + role + index;
            if (!messageIdMapRef.current.has(contentHash)) {
              messageIdMapRef.current.set(contentHash, `msg-${messageIdMapRef.current.size}-${Date.now()}`);
            }
            stableId = messageIdMapRef.current.get(contentHash)!;
          }

          return {
            id: stableId,
            role,
            content,
            interaction: undefined, // These will be parsed from content if needed
            whiteboard_actions: undefined, // These will be parsed from content if needed
            createdAt: msg.createdAt?.getTime() || Date.now(),
            isStreaming: msg.status === 'streaming',
            isInternal: isInternalMessage
          };
        });
        
        // Filter out internal messages for user display
        const transformedMessages = allTransformedMessages.filter(msg => !msg.isInternal);
        
        console.log('[useTutorStream] Message filtering results:', {
          totalMessages: allTransformedMessages.length,
          internalMessages: allTransformedMessages.filter(msg => msg.isInternal).length,
          displayMessages: transformedMessages.length,
          displayMessagePreviews: transformedMessages.map(msg => ({
            role: msg.role,
            content: msg.content.substring(0, 50) + '...'
          }))
        });
        
        // Create a hash to detect if messages actually changed (use stable IDs)
        const messageHash = transformedMessages.map(msg => `${msg.role}:${msg.content.length}:${msg.id}-${msg.isStreaming ? 1 : 0}-${msg.isInternal ? 1 : 0}`).join('|');
        
        // Only update if messages actually changed
        if (lastMessageHashRef.current !== messageHash) {
          console.log('[useTutorStream] Messages changed, updating state. Hash:', messageHash.substring(0, 100));
          lastMessageHashRef.current = messageHash;
          
          // Check again if component is still mounted before updating state
          if (!isComponentMountedRef.current) {
            return;
          }
          
          // Update local state
          setSessionState(prev => ({
            ...prev,
            messages: transformedMessages,
            loadingState: prev.loadingState === 'loading' ? 'idle' : prev.loadingState
          }));

          // Also update the global Zustand store with the same messages
          console.log('[useTutorStream] Syncing messages to global store:', transformedMessages.length);
          useSessionStore.setState({ messages: transformedMessages });

          // Call message handler for new messages (only non-internal ones)
          const prevLength = prevMessageCountRef.current;
          if (transformedMessages.length > prevLength) {
            const newMessages = transformedMessages.slice(prevLength);
            newMessages.forEach(message => {
              try {
                // Use setTimeout to break out of the render cycle for handlers
                setTimeout(() => {
                  handlersRef.current.onMessage?.(message);
                  
                  // Handle whiteboard actions
                  if (message.whiteboard_actions) {
                    handlersRef.current.onWhiteboardAction?.(message.whiteboard_actions);
                  }
                }, 0);
              } catch (error) {
                console.error('[useTutorStream] Error in message handler:', error);
              }
            });
            prevMessageCountRef.current = transformedMessages.length;
          }
        } else {
          console.log('[useTutorStream] Messages unchanged, skipping update');
        }
      }
    }, 50); // 50ms debounce
    
    // Cleanup timeout on unmount
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [uiMessages]); // Keep handlers separate to prevent excessive re-renders

  // Handle streaming completion separately to avoid circular dependencies
  useEffect(() => {
    if (agentMessages?.results && sessionState.loadingState === 'streaming') {
      const hasStreamingMessages = agentMessages.results.some(msg => 
        (msg as any).streaming === true
      );
      
      if (!hasStreamingMessages) {
        setSessionState(prev => ({ ...prev, loadingState: 'idle' }));
      }
    }
  }, [agentMessages?.results]);

  // Auto-start the session once thread is ready (separate effect to avoid circular dependency)
  useEffect(() => {
    if (threadId && !hasAutoStarted) {
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
  }, [threadId, hasAutoStarted]);

  // Check if tutor has started (first assistant message)
  useEffect(() => {
    if (sessionState.messages.length > 0 && !hasTutorStarted) {
      const firstAssistantMessage = sessionState.messages.find(msg => 
        msg.role === 'assistant' && !msg.isInternal
      );
      
      if (firstAssistantMessage) {
        console.log('[useTutorStream] AI tutor has started, showing interface');
        setHasTutorStarted(true);
        setSessionState(prev => ({ 
          ...prev, 
          loadingState: 'idle',
          loadingMessage: ''
        }));
      }
    }
  }, [sessionState.messages, hasTutorStarted]);

  // ===== NEW: Convex realtime whiteboard events =====
  // Subscribe to realtime_events that the whiteboard_agent writes. This replaces the
  // legacy WebSocket whiteboard_state handling.
  const realtimeEvents = useQuery(
    api.websockets.getSessionMessages,
    sessionId ? { session_id: sessionId } : "skip"
  );

  // Keep track of last handled realtime event timestamp to avoid double-processing
  const lastRealtimeTsRef = useRef<number>(0);

  useEffect(() => {
    if (!realtimeEvents || realtimeEvents === "skip") return;

    // Filter new events only
    const newEvents = realtimeEvents.filter((e: any) => e.timestamp > lastRealtimeTsRef.current);
    if (newEvents.length === 0) return;

    newEvents.forEach((evt: any) => {
      const data = evt.data;
      if (data && Array.isArray(data.actions) && data.actions.length > 0) {
        try {
          handlersRef.current.onWhiteboardAction?.(data.actions as WhiteboardAction[]);
        } catch (err) {
          console.error("[useTutorStream] Error handling realtime whiteboard actions", err);
        }
      }
    });

    // Update last processed timestamp
    const maxTs = Math.max(...newEvents.map((e: any) => e.timestamp));
    lastRealtimeTsRef.current = Math.max(lastRealtimeTsRef.current, maxTs);
  }, [realtimeEvents]);

  // Cleanup on unmount
  useEffect(() => {
    isComponentMountedRef.current = true;
    return () => {
      isComponentMountedRef.current = false;
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  return {
    ...sessionState,
    sendMessage,
    sendInteraction,
    triggerAIResponse,
    isConnected: threadId !== null && sessionState.loadingState !== 'error',
    threadId,
    hasTutorStarted,
    latency: null // Placeholder for compatibility
  };
} 