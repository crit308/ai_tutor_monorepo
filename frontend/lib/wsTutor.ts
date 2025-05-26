export type StreamEvent = Record<string, any>;

export function connectTutorStream(
  sessionId: string,
  token: string
): WebSocket {
  // Updated to use Convex WebSocket server (defaults to localhost:8080 for development)
  const base =
    process.env.NEXT_PUBLIC_BACKEND_WS_ORIGIN ||
    process.env.NEXT_PUBLIC_CONVEX_WS_URL ||
    'ws://localhost:8080';
  const url = new URL(`/ws/v2/session/${sessionId}`, base);
  url.searchParams.set('token', token);

  const ws = new WebSocket(url.toString());

  ws.onopen = () => {
    console.log('[TutorWS] Connected to Convex WebSocket server');
  };
  ws.onerror = (err) => {
    console.error('[TutorWS] WebSocket error:', err);
  };
  ws.onclose = (ev) => {
    console.log('[TutorWS] Connection closed:', ev.code, ev.reason);
  };
  ws.onmessage = (msg) => {
    try {
      const data: StreamEvent = JSON.parse(msg.data);
      handleStreamEvent(data);
    } catch (e) {
      console.error('[TutorWS] Could not parse message:', e);
    }
  };

  return ws;
}

// ===== Simple Event Emitter for Tutor Stream =====
type EventCallback = (payload: any) => void;
const listeners: Record<string, EventCallback[]> = {};

export function onTutorEvent(eventType: string, cb: EventCallback) {
  if (!listeners[eventType]) listeners[eventType] = [];
  listeners[eventType].push(cb);
}

export function offTutorEvent(eventType: string, cb: EventCallback) {
  if (!listeners[eventType]) return;
  listeners[eventType] = listeners[eventType].filter(fn => fn !== cb);
}

function emit(eventType: string, payload: any) {
  (listeners[eventType] || []).forEach(fn => fn(payload));
}
// ===== End Emitter Setup =====

function handleStreamEvent(event: StreamEvent) {
  switch (event.type) {
    case 'raw_response_event':
      emit('raw_response', event.data);
      break;
    case 'run_item_stream_event':
      if (event.item.type === 'question_output_item') emit('question', event.item);
      else if (event.item.type === 'feedback_output_item') emit('feedback', event.item);
      break;
    case 'agent_updated_stream_event':
      emit('agent_updated', event);
      break;
    case 'mastery_update':
      emit('mastery', event);
      break;
    case 'error':
      emit('error', event.detail);
      break;
    default:
      emit('unhandled', event);
      break;
  }
} 