import { create } from 'zustand';
import {
  LessonContent,
  Quiz,
  QuizFeedback,
  LoadingState,
  QuizUserAnswer,
  QuizUserAnswers,
  SessionAnalysis,
  QuizQuestion,
  QuizFeedbackItem,
  UserModelState,
  UserConceptMastery,
  UserInteractionOutcome,
  FocusObjective,
  TutorInteractionResponse,
  ErrorResponse,
  WhiteboardAction
} from '@/lib/types';
import type { User } from '@supabase/supabase-js';
import * as api from '@/lib/api';
import type { Canvas } from 'fabric'; // Import Canvas type

// Define connection status type (matches useTutorStream)
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'auth_error';

// Define structured error type
export interface StructuredError {
  message: string;
  code?: string; // e.g., SESSION_LOAD_FAILED, AUTH_ERROR
}

// Define a unified message type for the chat history
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant'; // Use role instead of sender
  content: string; // Always the string representation for basic display
  interaction?: TutorInteractionResponse | ErrorResponse | null; // Store the original interaction object for assistant messages
  isLoading?: boolean; // Optional loading state
  whiteboard_actions?: WhiteboardAction[]; // Optional whiteboard actions at the top level
  whiteboard_snapshot_index?: number; // For history browsing
}

// Export the LoadingState type as well
export type { LoadingState };

// Export the interface
export interface SessionState {
  // Core data state
  sessionId: string | null;
  folderId: string | null;
  vectorStoreId: string | null;
  lessonContent: LessonContent | null;
  quiz: Quiz | null;
  quizFeedback: QuizFeedback | null;
  quizUserAnswers: { [key: number]: QuizUserAnswer };
  loadingState: LoadingState;
  loadingMessage: string;
  error: StructuredError | null;
  user: User | null;
  sessionAnalysis: SessionAnalysis | null;
  isSubmittingQuiz: boolean;

  // WebSocket state
  webSocketSendFunction: ((payload: any) => void) | null;
  connectionStatus: ConnectionStatus;

  // --- NEW State for Interaction Model ---
  currentInteractionContent: TutorInteractionResponse | null;
  userModelState: UserModelState;
  currentQuizQuestion: QuizQuestion | null;
  isLessonComplete: boolean;
  focusObjective: FocusObjective | null;
  sessionEndedConfirmed: boolean;
  isQuestionLocked: boolean;

  // NEW: Array to hold chat history
  messages: ChatMessage[];

  // Whiteboard mode
  whiteboardMode: 'chat_only' | 'chat_and_whiteboard';

  // New state for Fabric canvas instance
  fabricCanvas: Canvas | null;

  // Whiteboard snapshot index synchronized from WhiteboardProvider
  currentWhiteboardSnapshotIndex: number;

  // Actions
  setSessionId: (sessionId: string) => void;
  setSelectedFolderId: (folderId: string | null) => void;
  setVectorStoreId: (vectorStoreId: string | null) => void;
  setLoading: (state: LoadingState, message?: string) => void;
  setError: (error: StructuredError | null) => void;
  setSessionAnalysis: (analysis: SessionAnalysis | null) => void;
  setIsSubmittingQuiz: (isSubmitting: boolean) => void;
  resetSession: () => void;
  setLoadingMessage: (message: string) => void;
  setUser: (user: User | null) => void;
  setFocusObjective: (focus: FocusObjective) => void;
  setWhiteboardMode: (mode: SessionState['whiteboardMode']) => void;
  setFabricCanvasInstance: (canvas: Canvas | null) => void;
  setIsQuestionLocked: (isLocked: boolean) => void;

  // WebSocket Actions
  registerWebSocketSend: (sendFn: (payload: any) => void) => void;
  deregisterWebSocketSend: () => void;

  // --- NEW Actions ---
  sendInteraction: (type: 'start' | 'next' | 'answer' | 'user_message' | 'summary' | 'previous' | 'end_session', data?: Record<string, any>) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  // Initial State
  sessionId: null,
  folderId: null,
  vectorStoreId: null,
  lessonContent: null,
  quiz: null,
  quizFeedback: null,
  sessionAnalysis: null,
  quizUserAnswers: {},
  isSubmittingQuiz: false,
  loadingState: 'idle',
  error: null,
  loadingMessage: '',
  user: null,

  // WebSocket state
  webSocketSendFunction: null,
  connectionStatus: 'idle',

  // --- NEW Initial State ---
  currentInteractionContent: null,
  userModelState: { concepts: {}, overall_progress: 0, current_topic: null, session_summary: "Session initializing." },
  currentQuizQuestion: null,
  isLessonComplete: false,
  focusObjective: null,
  sessionEndedConfirmed: false,
  isQuestionLocked: false,

  // NEW: Initialize messages array
  messages: [],

  // Whiteboard mode initial state
  whiteboardMode: 'chat_and_whiteboard',

  // New state for Fabric canvas instance
  fabricCanvas: null,

  // Whiteboard snapshot index synchronized from WhiteboardProvider
  currentWhiteboardSnapshotIndex: -1,

  // Actions
  setSessionId: (sessionId) => set({ sessionId, error: null }),
  setSelectedFolderId: (folderId) => set({ folderId }),
  setVectorStoreId: (vectorStoreId) => set({ vectorStoreId }),
  setLoading: (state, message = '') => set({ loadingState: state, loadingMessage: message, error: state === 'error' ? { message: message || 'An error occurred' } : null }),
  setError: (error) => set({ error: error, loadingState: error ? 'error' : 'idle' }),
  setUser: (user) => set({ user }),
  setSessionAnalysis: (analysis) => set({ sessionAnalysis: analysis }),
  setIsSubmittingQuiz: (isSubmitting) => set({ isSubmittingQuiz: isSubmitting }),
  setLoadingMessage: (message) => set({ loadingMessage: message }),
  setFocusObjective: (focus) => set({ focusObjective: focus }),
  setWhiteboardMode: (mode) => set({ whiteboardMode: mode }),
  setFabricCanvasInstance: (canvas) => set({ fabricCanvas: canvas }),
  setIsQuestionLocked: (isLocked) => set({ isQuestionLocked: isLocked }),

  // WebSocket Action Implementations
  registerWebSocketSend: (sendFn) => set({ webSocketSendFunction: sendFn }),
  deregisterWebSocketSend: () => set({ webSocketSendFunction: null }),

  // --- REVISED Interaction Logic ---
  sendInteraction: async (type, data) => {
      const { sessionId, webSocketSendFunction, whiteboardMode } = get();
      if (!sessionId) {
          set({ error: { message: "No active session." }, loadingState: 'error' });
          return;
      }
      if (!webSocketSendFunction) {
           set({ error: { message: "WebSocket not connected or ready." }, loadingState: 'error' });
           console.warn("sendInteraction: WebSocket send function not registered.");
           return;
      }

      set({ loadingState: 'interacting', loadingMessage: 'Sending...', error: null });

      try {
          // Construct the payload based on type
          let payload;
          let userMessage: ChatMessage | null = null;

          // Base data to include in all messages that need it
          const baseData = {
            ...(data || {}),
            whiteboard_mode: whiteboardMode,
          };

          if (type === 'user_message') {
              // Ensure data exists and has a 'text' property
              const text = data?.text;
              if (typeof text !== 'string') {
                  console.error("Store: 'user_message' type requires a 'text' field in data.");
                  set({ error: { message: "Invalid message format." }, loadingState: 'error', loadingMessage: '' });
                  return;
              }
              // Construct payload for user_message, ensuring text is at the top level of data if needed by BE
              // For now, assuming whiteboard_mode is part of the general data object
              payload = { type: type, data: { text: text, whiteboard_mode: whiteboardMode } }; 
              userMessage = {
                id: Date.now().toString(), // Simple ID for now
                role: 'user',
                content: text,
              };
          } else if (type === 'start' || type === 'next' || type === 'previous' || type === 'answer' || type === 'summary' || type === 'end_session') {
              payload = { type: type, data: baseData };
          } else {
             // Should not happen with defined types, but as a fallback
             console.warn(`Store: Unhandled interaction type for adding whiteboard_mode: ${type}`);
             payload = { type: type, data: data || {} };
          }
          
          console.log("Store: Calling registered WebSocket send function with payload:", payload);
          webSocketSendFunction(payload);

          // Add user message to the messages array immediately
          if (userMessage) {
              set(state => ({ messages: [...state.messages, userMessage!] }));
          }

      } catch (err: any) {
          const errorMessage = err.message || 'Failed to send interaction via WebSocket.';
          console.error("Store: Error sending interaction via WebSocket:", err);
          set({ error: { message: errorMessage }, loadingState: 'error', loadingMessage: '' });
      }
  },

  resetSession: () => set({
    sessionId: null,
    folderId: null,
    vectorStoreId: null,
    lessonContent: null,
    quiz: null,
    quizFeedback: null,
    sessionAnalysis: null,
    quizUserAnswers: {},
    isSubmittingQuiz: false,
    loadingState: 'idle',
    error: null,
    loadingMessage: '',
    currentInteractionContent: null,
    messages: [],
    user: null,
    userModelState: { concepts: {}, overall_progress: 0, current_topic: null, session_summary: "Session reset." },
    isLessonComplete: false,
    focusObjective: null,
    sessionEndedConfirmed: false,
    isQuestionLocked: false,
    currentQuizQuestion: null,
    webSocketSendFunction: null,
    connectionStatus: 'idle',
    whiteboardMode: 'chat_and_whiteboard',
    fabricCanvas: null,
    currentWhiteboardSnapshotIndex: -1,
  }),
}));