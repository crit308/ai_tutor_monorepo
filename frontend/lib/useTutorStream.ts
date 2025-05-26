import React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { connectTutorStream, StreamEvent, onTutorEvent, offTutorEvent } from './wsTutor';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction, type ToastActionElement } from '@/components/ui/toast';
import { useSessionStore, type SessionState, type StructuredError, type LoadingState, type ChatMessage } from '@/store/sessionStore';
import {
  InteractionResponseData,
  QuestionResponse,
  ErrorResponse,
  ExplanationResponse,
  FeedbackResponse,
  type TutorInteractionResponse,
  MessageResponse,
  WhiteboardAction,
  CanvasObjectSpec
} from '@/lib/types';
import { useWhiteboard } from '@/contexts/WhiteboardProvider';
import { getCanvasStateAsSpecs } from '@/lib/fabricObjectFactory';
import { Canvas } from 'fabric';

// Define more specific connection status types
type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'auth_error';

function getAnalysisAction(): ToastActionElement {
  return React.createElement(
    ToastAction as React.ElementType,
    {
      altText: 'Go to analysis',
      onClick: () => { window.location.href = `/session/${useSessionStore.getState().sessionId}/analysis`; }
    },
    'Go to analysis'
  ) as ToastActionElement;
}

export interface TutorStreamHandlers {
  onOpen?: () => void;
  onClose?: (ev: CloseEvent) => void;
  onError?: (err: Event | any) => void;
  onRawResponse?: (delta: any) => void;
  onRunItem?: (item: any) => void;
  onAgentUpdated?: (event: any) => void;
  onUnhandled?: (event: any) => void;
  onInteractionResponse?: (response: InteractionResponseData) => void;
  onWhiteboardStateReceived?: (actions: WhiteboardAction[]) => void;
  getFabricCanvasInstance?: () => Canvas | null;
}

import { useAuthToken } from '@convex-dev/auth/react';

export function useTutorStream(
  sessionId: string,
  handlers: TutorStreamHandlers = {}
) {
  const jwt = useAuthToken();
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pongTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const hasAttemptedConnectionRef = useRef(false);
  const isComponentMountedRef = useRef(true);
  const { toast } = useToast();
  const [latency, setLatency] = useState<number | null>(null);
  const pingTimestampRef = useRef<number | null>(null);
  const isMountedEffectRef = useRef(false); // Tracks if the *current* instance's effect is active
  const { dispatchWhiteboardAction } = useWhiteboard();

  // --- Use stable references for store actions ---
  const registerWebSocketSend = useSessionStore.getState().registerWebSocketSend;
  const deregisterWebSocketSend = useSessionStore.getState().deregisterWebSocketSend;
  const setSessionState = useSessionStore.setState;
  const getState = useSessionStore.getState;

  // --- Helper to update both local and store state ---
  const updateStatus = useCallback((status: ConnectionStatus, errorInfo?: { message: string; code?: string }) => {
    if (!isComponentMountedRef.current) return;
    setConnectionStatus(status);
    const storeUpdate: Partial<any> = { connectionStatus: status };
    if (status === 'error' || status === 'auth_error') {
      storeUpdate.error = errorInfo || { message: 'Connection error' };
      storeUpdate.loadingState = 'idle';
    }
    setSessionState(storeUpdate);
  }, [setSessionState]);

  // Use a ref to hold the latest connectionStatus so the callback stays stable
  const connectionStatusRef = useRef<ConnectionStatus>('idle');
  useEffect(() => { connectionStatusRef.current = connectionStatus; }, [connectionStatus]);

  const sendMessage = useCallback((payload: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const messageString = JSON.stringify(payload);
      console.log('[TutorWS Hook] Sending message:', messageString);
      try { wsRef.current.send(messageString); } catch (e) {
        console.error("[WebSocket] Error sending message:", e);
        handlers.onError?.(e);
      }
    } else {
      console.warn('[TutorWS Hook] send attempted when WS not open');
      handlers.onError?.(new Error("WebSocket disconnected. Cannot send message."));
      const status = connectionStatusRef.current;
      if (status !== 'reconnecting' && status !== 'connecting') {
        updateStatus('error', { message: 'Connection lost. Cannot send message.' });
      }
    }
  }, [handlers, updateStatus]);

  // --- Connection Logic wrapped in useCallback ---
  const connect = useCallback(() => {
    if (!isComponentMountedRef.current) {
      console.log('[WebSocket] connect called but component is unmounted. Aborting.');
      return;
    }
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      console.log('[WebSocket] Connect called but already open/connecting.');
      return;
    }
    // Clean up previous socket instance rigorously
    if (wsRef.current) {
      console.log("[WebSocket] Cleaning up previous socket before new connection.");
      wsRef.current.onclose = null; wsRef.current.onerror = null; wsRef.current.onmessage = null; wsRef.current.onopen = null;
      try { if (wsRef.current.readyState !== WebSocket.CLOSED) wsRef.current.close(1000, "Starting new connection"); } catch (e) { console.warn("Error closing previous socket:", e); }
      wsRef.current = null;
    }
    console.log(`[WebSocket] Attempting connection... (Attempt: ${reconnectAttemptsRef.current + 1})`);
    updateStatus(reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting');
    hasAttemptedConnectionRef.current = true;
    const ws = connectTutorStream(sessionId, jwt);
    wsRef.current = ws;
    ws.onopen = () => {
      if (wsRef.current !== ws || !isComponentMountedRef.current) { console.log("[WebSocket] Ignoring open event from stale connection or unmounted component."); ws.close(1000, "Stale connection/Unmounted"); return; }
      console.log(`[WebSocket] Connection OPENED for session: ${sessionId}`);
      reconnectAttemptsRef.current = 0;
      updateStatus('connected');
      handlers.onOpen?.();
      console.log('[WebSocket] Registering send function with store.');
      registerWebSocketSend(sendMessage);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
          pingTimestampRef.current = Date.now();
          if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);
          pongTimeoutRef.current = setTimeout(() => {
            console.warn(`[WebSocket] Pong timeout! No pong received within 15 seconds for session ${sessionId}.`);
            if (wsRef.current === ws) {
              updateStatus('error', { message: 'Connection timed out (pong not received).' });
              wsRef.current?.close(1006, "Pong timeout");
            }
          }, 15000);
          try { ws.send(JSON.stringify({ type: 'heartbeat' })); } catch (e) { console.error("[WebSocket] Error sending heartbeat:", e); }
        } else if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }
      }, 5000);
      setTimeout(() => {
        if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
          console.log("[WebSocket] Sending initial 'start' action...");
          try { sendMessage({ type: 'start' }); console.log("[WebSocket] Initial 'start' action sent successfully."); }
          catch (e) { console.error("[WebSocket] Error sending initial 'start' action:", e); handlers.onError?.(e); }
        }
      }, 100);
    };
    ws.onerror = (error) => {
      console.error(`[WebSocket] Error on socket for session ${sessionId}:`, error);
      if (wsRef.current !== ws || !isComponentMountedRef.current) { console.log("[WebSocket] Ignoring error from stale connection or unmounted component."); return; }
      updateStatus('error', { message: 'WebSocket connection error.' });
      handlers.onError?.(error);
    };
    ws.onclose = (event) => {
      if (wsRef.current !== ws) { console.log(`[WebSocket] Ignoring close event from STALE socket instance for session ${sessionId}.`); return; }
      console.log(`[WebSocket] Connection CLOSED for session ${sessionId}: Code=${event.code}, Reason='${event.reason}'`);
      wsRef.current = null;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current); pingIntervalRef.current = null;
      if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current); pongTimeoutRef.current = null;
      if (!isComponentMountedRef.current) {
        console.log('[WebSocket] Connection closed, but component already unmounted. Final state update skipped.');
        return;
      }
      handlers.onClose?.(event);
      if (event.code === 1008) {
        console.error(`[WebSocket] Authentication failed (Close code 1008). Not reconnecting.`);
        updateStatus('auth_error', { message: 'Authentication failed. Please log in again.', code: 'AUTH_ERROR' });
        toast({ title: 'Authentication Error', description: 'Your session is invalid. Please log in again.', variant: 'destructive', duration: 10000 });
        return;
      } else if (event.code === 1011) {
        console.error(`[WebSocket] Server error (Close code 1011). Not reconnecting.`);
        updateStatus('error', { message: 'The server encountered an internal error.', code: 'SERVER_ERROR_CLOSE' });
        toast({ title: 'Tutor Error', description: 'The tutor encountered an internal issue. Please try again later.', variant: 'destructive', duration: 10000 });
        return;
      } else if (event.code === 1000) {
        console.log('[WebSocket] Normal closure (Code 1000). Not reconnecting.');
        updateStatus('idle');
        return;
      } else {
        updateStatus('reconnecting', { message: `Connection closed unexpectedly (Code: ${event.code}). Reconnecting...`});
        reconnectAttemptsRef.current += 1;
        const delay = Math.min(15000, 1000 * 2 ** reconnectAttemptsRef.current);
        console.log(`[WebSocket] Scheduling reconnect after ${delay}ms... (Attempt ${reconnectAttemptsRef.current})`);
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          if (isComponentMountedRef.current) { connect(); }
          else { console.log('[WebSocket] Reconnect timer fired, but component unmounted.'); }
        }, delay);
      }
    };
    ws.onmessage = (event) => {
      if (wsRef.current !== ws || !isComponentMountedRef.current) { 
        console.log("[WebSocket] Ignoring message from stale connection or unmounted component."); 
        return; 
      }
      console.log("[WS Received Raw]:", event.data);
      let parsedData;
      try { 
        parsedData = JSON.parse(event.data as string); 
      } catch (e) { 
        console.error('[WS] message parse error', e, event.data);
        handlers.onError?.(e); 
        updateStatus('error', { message: 'Received invalid message format.' }); 
        return; 
      }
      console.log("[WS Parsed Data]:", parsedData);

      // Handle whiteboard_state first
      if (parsedData?.type === 'whiteboard_state' && parsedData?.data?.actions) {
          if (Array.isArray(parsedData.data.actions)) {
              console.log(`[WS] Received whiteboard_state with ${parsedData.data.actions.length} actions.`);
              handlers.onWhiteboardStateReceived?.(parsedData.data.actions as WhiteboardAction[]);
          } else {
              console.warn('[WS] Received whiteboard_state but data.actions is not an array:', parsedData.data.actions);
          }
          return; // Handled
      }

      // Handle REQUEST_BOARD_STATE
      if (parsedData?.type === 'REQUEST_BOARD_STATE') {
        console.log("[WS] Received REQUEST_BOARD_STATE:", parsedData);
        const requestId = parsedData.request_id;

        if (!requestId) {
            console.error("[WS] REQUEST_BOARD_STATE missing request_id", parsedData);
            return; // Cannot respond without request_id
        }

        const currentCanvasInstance = handlers.getFabricCanvasInstance?.();

        if (currentCanvasInstance) {
            try {
                const specs = getCanvasStateAsSpecs(currentCanvasInstance);
                console.log("[WS] Sending BOARD_STATE_RESPONSE for request_id:", requestId);
                sendMessage({ type: 'BOARD_STATE_RESPONSE', request_id: requestId, payload: specs });
            } catch (error) {
                console.error("[WS] Error in getCanvasStateAsSpecs or sending BOARD_STATE_RESPONSE:", error);
                sendMessage({ type: 'BOARD_STATE_RESPONSE', request_id: requestId, payload: [], error: 'Failed to get/send canvas state' });
            }
        } else {
            console.error("[WS] Could not access fabricCanvas instance for REQUEST_BOARD_STATE.");
            sendMessage({ type: 'BOARD_STATE_RESPONSE', request_id: requestId, payload: [], error: 'Canvas instance not available' });
        }
        return; // Handled
      }

      // Handle heartbeat acknowledgment from Convex WebSocket server
      if (parsedData?.type === 'heartbeat_ack' || parsedData?.type === 'pong') {
        if (pingTimestampRef.current) {
          setLatency(Date.now() - pingTimestampRef.current);
          pingTimestampRef.current = null;
        }
        // Clear the pong timeout timer since we received a response
        if (pongTimeoutRef.current) {
          clearTimeout(pongTimeoutRef.current);
          pongTimeoutRef.current = null;
        }
        console.debug('[WS] Received heartbeat acknowledgment');
        return; // Handled
      }
      if (parsedData?.type === 'ack') {
        console.debug('[WS] Received ack');
        return; // Handled
      }
      if (parsedData?.type === 'raw_delta') {
        handlers.onRawResponse?.(parsedData.delta);
        return; // Handled
      }

      // Handle SESSION_INIT_STATE (initial session hydration)
      if (parsedData?.type === 'SESSION_INIT_STATE') {
        console.log('[WS] Received SESSION_INIT_STATE:', parsedData);
        const chatHistory = parsedData.chat_history || [];
        const transformedMessages: ChatMessage[] = chatHistory.map((msg: any, idx: number) => {
          const id: string = msg.id?.toString() || `${Date.now()}_${idx}`;
          const role: 'user' | 'assistant' = msg.role === 'user' || msg.role === 'assistant'
            ? msg.role
            : (msg.sender || msg.role) === 'user' ? 'user' : 'assistant';
          const content: string = msg.content || msg.text || '';
          const interaction = (msg.interaction && typeof msg.interaction === 'object') ? msg.interaction as TutorInteractionResponse : undefined;
          const whiteboard_actions = Array.isArray(msg.whiteboard_actions) ? msg.whiteboard_actions as WhiteboardAction[] : undefined;
          return { id, role, content, interaction, whiteboard_actions } as ChatMessage;
        });
        setSessionState((prev) => {
          const newUserModelState = parsedData.latest_user_model_state ?? parsedData.user_model_state ?? (parsedData as any).userModelState ?? prev.userModelState;
          const newFocusObjective = parsedData.current_focus_objective ?? parsedData.focus_objective ?? prev.focusObjective;
          return {
            ...prev,
            messages: transformedMessages.length ? transformedMessages : prev.messages,
            userModelState: newUserModelState,
            focusObjective: newFocusObjective,
            loadingState: 'idle',
            loadingMessage: ''
          };
        });
        if (Array.isArray(parsedData.whiteboard_actions_to_replay) && parsedData.whiteboard_actions_to_replay.length > 0) {
          console.log(`[WS] Replaying ${parsedData.whiteboard_actions_to_replay.length} whiteboard actions from SESSION_INIT_STATE.`);
          dispatchWhiteboardAction(parsedData.whiteboard_actions_to_replay as WhiteboardAction[]);
        }
        return; // Handled
      }

      // Handle full InteractionResponseData structure
      if (
        parsedData && typeof parsedData === 'object' &&
        'content_type' in parsedData && 'data' in parsedData && 'user_model_state' in parsedData
      ) {
        const interactionResponse = parsedData as InteractionResponseData;
        console.log(`[WS] Received InteractionResponse: type=${interactionResponse.content_type}`);

        // Pass to generic handler if provided
        handlers.onInteractionResponse?.(interactionResponse);

        // Dispatch whiteboard actions if present in the wrapper
        if (interactionResponse.whiteboard_actions && Array.isArray(interactionResponse.whiteboard_actions)) {
          // Assuming dispatchWhiteboardAction is available (e.g. from useWhiteboard or passed via handlers)
          // For now, let's use the onWhiteboardStateReceived handler as a generic way to pass actions.
          // This might need adjustment if dispatchWhiteboardAction from useWhiteboard context is preferred here.
          handlers.onWhiteboardStateReceived?.(interactionResponse.whiteboard_actions);
          console.log('[WS] Dispatched whiteboard_actions from InteractionResponseData:', interactionResponse.whiteboard_actions);
        }

        // Update Zustand store
        setSessionState((prevState) => {
            const tutorInteractionPayload = interactionResponse.data; // Payload from backend
            const contentType = interactionResponse.content_type;

            // Ensure the payload contains a response_type field (backend may omit defaults)
            if (contentType && typeof tutorInteractionPayload === 'object' && tutorInteractionPayload && !('response_type' in tutorInteractionPayload)) {
                (tutorInteractionPayload as any).response_type = contentType;
            }

            const update: Partial<SessionState> = {
                userModelState: interactionResponse.user_model_state,
                loadingState: 'idle',
                loadingMessage: '',
                error: null, // Reset error on successful interaction
                currentInteractionContent: tutorInteractionPayload, // Store the actual TutorInteractionResponse (data part)
                sessionEndedConfirmed: prevState.sessionEndedConfirmed,
            };
            let newMessages = prevState.messages;
            let messageContentString = "Assistant message processed.";
            // assistantInteractionForMessage should also be from tutorInteractionPayload
            let assistantInteractionForMessage: TutorInteractionResponse | ErrorResponse | null = tutorInteractionPayload;

            switch (contentType) {
                case 'explanation': {
                    const explanationData = tutorInteractionPayload as ExplanationResponse;
                    messageContentString = explanationData.explanation_text || "Explanation received.";
                    break;
                }
                case 'message': {
                    const messageData = tutorInteractionPayload as MessageResponse;
                    messageContentString = messageData.text || "Message received.";
                    break;
                }
                case 'question': {
                    const questionData = tutorInteractionPayload as QuestionResponse;
                    messageContentString = `Question: ${questionData.question_data.question}`;
                    if (questionData.question_data.options && Array.isArray(questionData.question_data.options)) {
                        const options = questionData.question_data.options.map((opt: string, i: number) => `\n${i + 1}. ${opt}`).join('');
                        messageContentString += options;
                    }
                    break;
                }
                case 'feedback': {
                    const feedbackData = tutorInteractionPayload as FeedbackResponse;
                    if (feedbackData.feedback_items && feedbackData.feedback_items.length > 0) {
                        const fbItem = feedbackData.feedback_items[0];
                        messageContentString = `Feedback (${fbItem.is_correct ? 'Correct' : 'Incorrect'}): Regarding "${fbItem.question_text}"`;
                        if (fbItem.explanation) messageContentString += `
Explanation: ${fbItem.explanation}`;
                        if (fbItem.improvement_suggestion) messageContentString += `
Suggestion: ${fbItem.improvement_suggestion}`;
                    } else {
                        messageContentString = "Feedback received, but details are unavailable.";
                        console.warn('[WS Store Update] FeedbackResponse received but feedback_items is missing or empty:', feedbackData);
                        update.currentInteractionContent = {
                            response_type: 'error',
                            message: 'Feedback details missing.',
                        } as ErrorResponse;
                    }
                    break;
                }
                case 'error': {
                    const errorPayload = tutorInteractionPayload as ErrorResponse;
                    update.error = { message: errorPayload.message, code: errorPayload.error_code };
                    update.loadingState = 'error';
                    // currentInteractionContent is already set to tutorInteractionPayload which is ErrorResponse here
                    messageContentString = `Error: ${errorPayload.message}`;
                    // toast logic can be here or in the component observing the error state
                    break;
                }
                case 'session_ended':
                    update.sessionEndedConfirmed = true;
                    update.currentInteractionContent = null; // Clear content on session end
                    assistantInteractionForMessage = null; // No specific interaction object for system message
                    messageContentString = 'Session ended.';
                    break;
                default:
                    console.warn(`[WS Store Update] Unhandled content_type: ${contentType}`, tutorInteractionPayload);
                    update.currentInteractionContent = null;
                    assistantInteractionForMessage = null;
                    messageContentString = `Received unhandled message type: ${contentType}`;
            }

            // Add assistant message to history
            if (contentType !== 'error' || (contentType === 'error' && assistantInteractionForMessage)) {
                 // For errors, assistantInteractionForMessage will be the ErrorResponse object itself.
                 // For session_ended, assistantInteractionForMessage becomes null, but we still add a system message.
                 const chatMsgInteraction = (contentType === 'session_ended') ? null : assistantInteractionForMessage;

                const snapshotIdx = useSessionStore.getState().currentWhiteboardSnapshotIndex;
                const messageToAdd: ChatMessage = {
                    id: Date.now().toString() + Math.random().toString(36).substring(2),
                    role: 'assistant',
                    content: messageContentString,
                    interaction: chatMsgInteraction,
                    whiteboard_actions: interactionResponse.whiteboard_actions || undefined,
                    whiteboard_snapshot_index: (typeof snapshotIdx === 'number' && snapshotIdx >= 0) ? snapshotIdx : undefined,
                };
                newMessages = [...prevState.messages, messageToAdd];
                update.messages = newMessages;
            }
            
            console.log("[WS Store Update] Final state update object:", update);
            return { ...prevState, ...update };
        });

        return; // Handled: InteractionResponseData
      } else {
         console.warn("[WS] Received data does not match InteractionResponseData or other known types:", parsedData);
      }

      // --- Handle other event types (if any) ---
      // Example: Agent updated event
      if (parsedData?.type === 'agent_updated') {
        handlers.onAgentUpdated?.(parsedData.event);
        return; // Handled
      }
      // Example: Run item event
      if (parsedData?.type === 'run_item') {
        handlers.onRunItem?.(parsedData.item);
        return; // Handled
      }

      // Default/Fallback Handling
      handlers.onUnhandled?.(parsedData);
      console.warn("[WS] Unhandled message type or structure:", parsedData);
    };
    if (wsRef.current !== ws) {
      console.warn("[WebSocket] wsRef.current was potentially overwritten immediately after creation. Race condition?");
    }
  }, [sessionId, jwt, handlers, registerWebSocketSend, sendMessage, toast, setSessionState, getState, updateStatus, dispatchWhiteboardAction]);

  // --- Main Effect for Connection Management ---
  useEffect(() => {
    isComponentMountedRef.current = true; // Component is mounting or re-mounting

    // Prevent double invocation issues in StrictMode/Fast Refresh
    if (isMountedEffectRef.current) {
       console.log("[WebSocket] Mount effect skipped: Already mounted/running from a previous effect run.");
       // If we skip, it means the previous effect's instance is likely the one we want to keep.
       // We might need to ensure the cleanup from THIS skipped run doesn't interfere,
       // but the main goal is to let the *first* effect's instance establish itself.
       return;
    }
    isMountedEffectRef.current = true;
    console.log("[WebSocket] Mount effect running. Attempting initial connect.");

    connect(); // Attempt connection

    // Store the WebSocket instance initiated by THIS effect run
    // Note: connect() sets wsRef.current asynchronously within itself.
    // We capture the ref value *after* connect starts, but the instance might change later.
    // The check inside cleanup needs to be robust.


    return () => {
      console.log(`[WebSocket] Cleanup effect running for session: ${sessionId}`);
      isMountedEffectRef.current = false; // Mark this specific effect instance as "unmounted"

      // Store the WebSocket instance that was active *when this cleanup function was created*.
      const wsInstanceAtCleanupTime = wsRef.current;

      // Add a small delay ONLY IN DEV to see if a remount happens quickly
      // This helps prevent the first mount's cleanup from destroying the second mount's connection
      const timeoutId = setTimeout(() => {
          console.log(`[WebSocket] Delayed cleanup executing. isMountedEffectRef.current (flag from other potential effect): ${isMountedEffectRef.current}`);

          // Only perform cleanup if another mount effect hasn't immediately set the flag back to true
          // AND if the WebSocket instance associated with this cleanup closure still exists.
          if (!isMountedEffectRef.current && wsInstanceAtCleanupTime) {
               console.log(`[WebSocket] Performing cleanup for WS instance associated with this effect run.`);

               // Clear timers associated with this hook instance
               if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
               if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
               if (pongTimeoutRef.current) { clearTimeout(pongTimeoutRef.current); pongTimeoutRef.current = null; }


               // Nullify callbacks on the specific instance we captured to prevent memory leaks/stale closures
               wsInstanceAtCleanupTime.onclose = null;
               wsInstanceAtCleanupTime.onerror = null;
               wsInstanceAtCleanupTime.onmessage = null;
               wsInstanceAtCleanupTime.onopen = null;

               try {
                  // Check the state of the instance we are cleaning up
                  if (wsInstanceAtCleanupTime.readyState === WebSocket.OPEN || wsInstanceAtCleanupTime.readyState === WebSocket.CONNECTING) {
                      wsInstanceAtCleanupTime.close(1000, "Component unmounting or effect cleanup");
                      console.log("[WebSocket] WS close called in delayed cleanup.");
                  } else {
                      console.log(`[WebSocket] WS not open/connecting (state: ${wsInstanceAtCleanupTime.readyState}), cleanup skipping close call.`);
                  }
               } catch (e) { console.warn("[WebSocket] Error during delayed cleanup close:", e)}

               // Only clear the main wsRef if the instance we just closed IS the currently active one.
               // This prevents accidentally nulling out the ref if a quick remount already established a new connection.
               if(wsRef.current === wsInstanceAtCleanupTime) {
                    wsRef.current = null;
                    console.log('[WebSocket] Cleared main wsRef.');
               } else {
                    console.log('[WebSocket] Main wsRef points to a different instance; not clearing it.');
               }
               console.log('[WebSocket] Deregistering send function.');
               deregisterWebSocketSend(); // Deregister from store
          } else {
              console.log(`[WebSocket] Delayed cleanup skipped: Component likely remounted quickly or WS instance changed/already cleaned up.`);
          }
          // Mark the overall component as potentially unmounted after cleanup logic runs
          // Note: This assumes the *final* cleanup corresponds to the actual component unmount.
          // This might be slightly delayed.
          if (!isMountedEffectRef.current) { // Check again in case remount happened during timeout
             isComponentMountedRef.current = false;
             console.log('[WebSocket] Component marked as unmounted after delayed cleanup.')
          }

      }, 150); // Small delay (e.g., 150ms) - adjust as needed

      // This inner return function cleans up the setTimeout itself if the component
      // truly unmounts (or the effect re-runs) *before* the 150ms delay finishes.
      console.log('[WebSocket] Cleanup effect complete, clearing timeout if it exists.');
      clearTimeout(timeoutId);
    };
  }, [sessionId, jwt, connect, deregisterWebSocketSend, registerWebSocketSend, sendMessage]); // Added register/sendMessage dependencies

  // --- Cleanup on unmount (redundant with useEffect cleanup but belts and suspenders) ---
  useEffect(() => {
    // This effect ONLY runs once on mount and returns a cleanup function for final unmount
    return () => {
        console.log("[WebSocket] FINAL unmount effect triggered.");
        isComponentMountedRef.current = false; // Mark definitively as unmounted
        isMountedEffectRef.current = false; // Ensure effect flag is also false

        // Clear any outstanding timers
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);

        const currentWs = wsRef.current;
        if (currentWs) {
            console.log("[WebSocket] Closing socket in FINAL unmount cleanup.");
            // Remove listeners to prevent errors after unmount
            currentWs.onclose = null;
            currentWs.onerror = null;
            currentWs.onmessage = null;
            currentWs.onopen = null;
            try { if (currentWs.readyState === WebSocket.OPEN) currentWs.close(1000, "Component unmounted definitively"); } catch (e) { console.warn("[WebSocket] Error closing socket in final unmount:", e); }
            wsRef.current = null;
        }
        console.log('[WebSocket] Deregistering send function on FINAL unmount.');
        deregisterWebSocketSend(); // Ensure deregistration happens
    };
  }, [deregisterWebSocketSend]); // Only needs store action dependency

  return { connectionStatus, latency, sendMessage };
} 