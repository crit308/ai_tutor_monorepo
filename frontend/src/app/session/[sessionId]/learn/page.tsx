'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSessionStore } from '@/store/sessionStore';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthToken } from '@convex-dev/auth/react';
import { useTutorStream } from '../../../../../lib/useTutorStream';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import type { SessionState, ChatMessage, StructuredError } from '@/store/sessionStore';
import { Button } from '@/components/ui/button';
import { useToast } from "@/components/ui/use-toast";
import Whiteboard from '@/components/whiteboard/Whiteboard';
import { Textarea } from '@/components/ui/textarea';
import { Send } from 'lucide-react';
import ChatHistory from '@/components/ChatHistory';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { WhiteboardProvider, useWhiteboard } from '@/contexts/WhiteboardProvider';
import WhiteboardTools from '@/components/whiteboard/WhiteboardTools';
import type { WhiteboardAction, ErrorResponse, InteractionResponseData } from '@/lib/types';
import { WhiteboardModeToggle } from '@/components/ui/WhiteboardModeToggle';
import { fetchSessionMessages } from '@/lib/api';

function InnerLearnPage() {
  console.log("LearnPage MOUNTING");

  const { sessionId } = useParams() as { sessionId?: string };
  const router = useRouter();
  const { toast } = useToast();
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const {
    currentInteractionContent,
    loadingState,
    error,
    connectionStatus,
    sendInteraction,
    sessionEndedConfirmed,
    messages,
    whiteboardMode,
    fabricCanvas,
    setIsQuestionLocked,
  } = useSessionStore(
    useShallow((state: SessionState) => ({
      currentInteractionContent: state.currentInteractionContent,
      loadingState: state.loadingState,
      error: state.error,
      connectionStatus: state.connectionStatus,
      sendInteraction: state.sendInteraction,
      sessionEndedConfirmed: state.sessionEndedConfirmed,
      messages: state.messages,
      whiteboardMode: state.whiteboardMode,
      fabricCanvas: state.fabricCanvas,
      setIsQuestionLocked: state.setIsQuestionLocked,
    }))
  );

  const { isLoading: authLoading } = useAuth();
  const jwt = useAuthToken();

  const { dispatchWhiteboardAction } = useWhiteboard();

  const streamHandlers = React.useMemo(() => ({
    onWhiteboardStateReceived: (actions: WhiteboardAction[]) => {
        console.log('[LearnPage] Received whiteboard state actions:', actions);
        if (actions && actions.some(action => 
            action.type === "ADD_OBJECTS" && 
            action.objects.some(obj => obj.metadata?.role === 'option_selector'))
        ) {
            console.log('[LearnPage] Whiteboard actions include new option_selectors. UNLOCKING options via direct store call.');
            useSessionStore.getState().setIsQuestionLocked(false);
        }

        if (actions && actions.length > 0) {
            dispatchWhiteboardAction(actions);
        }
    },
    getFabricCanvasInstance: () => {
        return useSessionStore.getState().fabricCanvas;
    },
    onInteractionResponse: (response: InteractionResponseData) => {
        if (response.content_type === 'error') {
            const errorData = response.data as ErrorResponse;
            toast({
                title: `Tutor Error${errorData.error_code ? ` (${errorData.error_code})` : ''}`,
                description: errorData.message || 'An unknown error occurred.',
                variant: 'destructive',
                duration: 7000,
            });
        }
    }
  }), [dispatchWhiteboardAction, toast]);

  const { latency } = useTutorStream(sessionId || '', streamHandlers);

  useEffect(() => {
    return () => {
      console.log("LearnPage UNMOUNTING");
    };
  }, []);

  useEffect(() => {
    console.log(`[LearnPage] Effect for currentInteractionContent: type=${currentInteractionContent?.response_type}`);
    if (currentInteractionContent) {
      if (currentInteractionContent.response_type === 'feedback') {
        console.log('[LearnPage] Feedback received. LOCKING question. Setting isQuestionLocked=true.');
        setIsQuestionLocked(true);
      } else if (currentInteractionContent.response_type === 'explanation') {
        const storeIsLocked = useSessionStore.getState().isQuestionLocked;
        if (!storeIsLocked) {
            console.log('[LearnPage] Explanation received while options were unlocked. Assuming post-answer. LOCKING question.');
            setIsQuestionLocked(true);
        }
      }
      if (
        currentInteractionContent.response_type === 'explanation' &&
        (currentInteractionContent as any).is_last_segment === true
      ) {
        console.log('[LearnPage] Last explanation segment received, auto-advancing...');
        const timer = setTimeout(() => {
             sendInteraction('next');
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [currentInteractionContent, setIsQuestionLocked, sendInteraction]);

  useEffect(() => {
    if (sessionEndedConfirmed) {
      console.log('[LearnPage] Session end confirmed by backend.');
      toast({
        title: "Session Ended",
        description: "Analysis is processing in the background.",
        duration: 5000,
      });
      const redirectTimer = setTimeout(() => {
        router.push('/');
      }, 3000);
      return () => clearTimeout(redirectTimer);
    }
  }, [sessionEndedConfirmed, router, toast]);

  console.log('[LearnPage] Rendering. Store Messages:', messages.length, 'Status:', connectionStatus, 'LoadingState:', loadingState, 'AuthLoading:', authLoading);

  const getStatusColor = (status: typeof connectionStatus): string => {
    switch (status) {
      case 'connected': return 'lightgreen';
      case 'connecting':
      case 'reconnecting': return 'orange';
      case 'error':
      case 'auth_error': return 'salmon';
      case 'idle':
      default: return 'grey';
    }
  };
  const statusColor = getStatusColor(connectionStatus);

  const isLoading = authLoading || connectionStatus === 'connecting' || connectionStatus === 'reconnecting';
  const isAuthError = connectionStatus === 'auth_error';
  const isConnectionError = connectionStatus === 'error';
  const isErrorState = isAuthError || isConnectionError;
  const missingCredentials = !sessionId || !jwt;

  const errorDetails = error as StructuredError | null;
  const errorTitle = isAuthError ? "Authentication Error" : "Connection Error";
  const errorMessage = errorDetails?.message || (isAuthError ? "Authentication failed. Please log in again." : "An unexpected error occurred.");

  const handleEndSession = async () => {
    if (!sessionId) return;
    setIsEndingSession(true);
    try {
      await sendInteraction('end_session', { session_id: sessionId });
      console.log('Session end interaction sent.');
    } catch (error) {
      console.error('Failed to send end session interaction:', error);
      toast({
        title: "Error Ending Session",
        description: (error as Error)?.message || "Could not send end session request.",
        variant: "destructive",
      });
      setIsEndingSession(false);
    }
  };

  const isInputDisabled = connectionStatus !== 'connected' || loadingState === 'interacting';

  const handleSendMessage = useCallback(async () => {
    const trimmedInput = userInput.trim();
    if (!trimmedInput || isInputDisabled) return;

    console.log('[LearnPage] Sending user message:', trimmedInput);

    sendInteraction('user_message', { text: trimmedInput });
    setUserInput('');

  }, [userInput, isInputDisabled, sendInteraction]);

  const handleKeyPress = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const handleAnswerSubmit = (selectedIndex: number) => {
    console.log(`[LearnPage] handleAnswerSubmit: Submitting answer index: ${selectedIndex}.`);
    sendInteraction('answer', { answer_index: selectedIndex });
  };

  const handleNext = () => {
    console.log("[LearnPage] Sending 'next' interaction");
    sendInteraction('next');
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen w-screen"><LoadingSpinner message={connectionStatus === 'connecting' ? "Connecting..." : connectionStatus === 'reconnecting' ? "Reconnecting..." : "Initializing Session..."} /></div>;
  }

  if (isErrorState || missingCredentials) {
    const title = missingCredentials ? "Missing Information" : errorTitle;
    const description = missingCredentials ? "Session ID or authentication token is missing." : errorMessage;
    return (
      <div className="flex items-center justify-center h-screen w-screen p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{description}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="h-screen w-screen bg-background"
    >
      {/* Chat Panel: 1/3 width */}
      <ResizablePanel defaultSize={33} minSize={20} className="flex flex-col">
        <div className="flex-1 overflow-y-auto p-4">
          <ChatHistory 
             messages={messages} 
             onNext={() => sendInteraction('next')} 
             onLoadMore={async () => {
                if (isLoadingMore) return;
                setIsLoadingMore(true);
                try {
                   const earliest = messages[0];
                   const beforeId = earliest ? earliest.id : undefined;
                   const older = await fetchSessionMessages(sessionId!, beforeId);
                   if (older && older.length) {
                       useSessionStore.setState(state => ({ messages: [...older.map(m => m as any as ChatMessage), ...state.messages] }));
                   }
                } catch (err) {
                   console.error('Failed to fetch older messages:', err);
                } finally {
                   setIsLoadingMore(false);
                }
             }}
          />
        </div>
        <div className="p-4 border-t border-border bg-background">
          <div className="flex items-center gap-2 mb-2">
            <WhiteboardModeToggle />
          </div>
          <div className="flex items-center gap-2">
            <Textarea
              placeholder={isInputDisabled ? "Connecting or processing..." : "Type your message..."}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 resize-none shadow-sm"
              rows={1}
              disabled={isInputDisabled}
            />
            <Button onClick={handleSendMessage} disabled={isInputDisabled || !userInput.trim()} size="icon" className="shadow-sm">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      {/* Whiteboard Panel: 2/3 width */}
      {whiteboardMode === 'chat_and_whiteboard' && (
        <>
          <ResizablePanel defaultSize={67} minSize={30} className="flex flex-col">
            {/* Whiteboard Tools Bar */}
            <WhiteboardTools />

            {/* Whiteboard Canvas */}
            <div className="flex-1 p-4 overflow-y-auto relative">
              <Whiteboard />
            </div>

            {/* Footer Controls */}
            <div className="p-2 border-t border-border flex justify-end gap-2 bg-background">
              <Button
                onClick={handleEndSession}
                variant="destructive"
                disabled={isEndingSession || connectionStatus !== 'connected'}
              >
                {isEndingSession ? <LoadingSpinner size={16}/> : 'End Session & Analyze'}
              </Button>
            </div>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}

const LearnPage: React.FC = () => (
  <WhiteboardProvider>
    <InnerLearnPage />
  </WhiteboardProvider>
);

export default LearnPage; 