import React, { useState } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import type { ConnectionStatus, StructuredError } from '@/store/sessionStore';
import { useShallow } from 'zustand/react/shallow';

// Placeholder/Basic Components (Can be replaced with styled versions)
const LoadingSpinner = () => <div className="p-4 text-center text-gray-500">Loading...</div>; // Basic spinner
const ErrorDisplay = ({ error }: { error: StructuredError }) => (
  <div className="p-4 bg-red-100 border border-red-300 rounded-md text-red-800">
    <strong>Error:</strong> {error.message} {error.code ? `(${error.code})` : ''}
  </div>
); // Basic error display

interface TutorChatProps {
  sessionId: string;
  jwt: string;
}

export default function TutorChat({ sessionId, jwt }: TutorChatProps) {
  const [input, setInput] = useState('');

  // Only get state needed for sending messages and managing input state
  const {
    sendInteraction,
    loadingState, // Keep for disabling input
    error, // Keep for showing connection errors
    connectionStatus: wsConnectionStatus
  } = useSessionStore(
    useShallow((state) => ({
      sendInteraction: state.sendInteraction,
      loadingState: state.loadingState,
      error: state.error,
      connectionStatus: state.connectionStatus,
    }))
  );

  const handleSend = () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || wsConnectionStatus !== 'connected') return;

    sendInteraction('user_message', { text: trimmedInput });
    setInput('');
  };

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto border rounded-lg shadow-md bg-white">
      {/* Display Area - This should now contain message history or be empty */}
      <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-gray-50">
        {/* Placeholder for message history rendering */} 
        <div className="text-center text-gray-400 italic py-4">Chat Area</div>
         {/* Display connection errors here if desired */} 
         {error && wsConnectionStatus === 'error' && (
            <ErrorDisplay error={error} />
         )}
      </div>

      {/* Input Area */} 
      <div className="flex-shrink-0 p-4 border-t bg-white flex space-x-2">
        <input
          className="flex-1 p-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={loadingState === 'interacting' ? "Tutor is thinking..." : "Type your message or response..."}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()} // Send on Enter, allow Shift+Enter for newline
          disabled={wsConnectionStatus !== 'connected' || loadingState === 'interacting'}
        />
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleSend}
          disabled={wsConnectionStatus !== 'connected' || loadingState === 'interacting'}
        >
          Send
        </button>
      </div>
    </div>
  );
} 