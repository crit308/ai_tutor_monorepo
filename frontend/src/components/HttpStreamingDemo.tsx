import React, { useState } from 'react';
import { useHttpTutorStream } from '@/hooks/useHttpTutorStream';

interface HttpStreamingDemoProps {
  sessionId: string;
  userId: string;
}

export function HttpStreamingDemo({ sessionId, userId }: HttpStreamingDemoProps) {
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; isStreaming?: boolean }>>([]);

  const {
    sendMessage,
    stopStreaming,
    streamingMessage,
    isStreaming,
    error,
    isConnected
  } = useHttpTutorStream({
    sessionId,
    onMessage: (message) => {
      // Update the streaming message in real-time
      setMessages(prev => {
        const filtered = prev.filter(m => m.role !== 'assistant' || !m.isStreaming);
        return [...filtered, {
          role: 'assistant',
          content: message.content,
          isStreaming: message.isStreaming
        }];
      });
    },
    onError: (errorMsg) => {
      console.error('Streaming error:', errorMsg);
    },
    onComplete: () => {
      console.log('Streaming completed');
    }
  });

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isStreaming) return;

    // Add user message immediately
    const userMessage = { role: 'user' as const, content: inputMessage.trim() };
    setMessages(prev => [...prev, userMessage]);

    // Clear input
    const messageToSend = inputMessage.trim();
    setInputMessage('');

    // Send to streaming endpoint
    await sendMessage(messageToSend, userId);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">HTTP Streaming Chat Demo</h2>
        <div className="flex items-center gap-2 text-sm">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-gray-600">
            {isConnected ? 'Connected' : 'Disconnected'} • Session: {sessionId}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="border rounded-lg p-4 h-96 overflow-y-auto mb-4 bg-gray-50">
        {messages.length === 0 ? (
          <div className="text-gray-500 text-center">Start a conversation...</div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className={`mb-3 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
              <div
                className={`inline-block max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-800 border'
                }`}
              >
                <div className="text-xs font-semibold mb-1 opacity-70">
                  {msg.role === 'user' ? 'You' : 'AI Tutor'}
                  {msg.isStreaming && <span className="ml-1 animate-pulse">●</span>}
                </div>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          Error: {error}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <textarea
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message..."
          disabled={isStreaming}
          className="flex-1 p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={2}
        />
        <div className="flex flex-col gap-1">
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isStreaming}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isStreaming ? 'Sending...' : 'Send'}
          </button>
          {isStreaming && (
            <button
              onClick={stopStreaming}
              className="px-4 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="mt-2 text-xs text-gray-500">
        {isStreaming && 'AI is typing...'}
        {streamingMessage && !isStreaming && 'Message completed'}
      </div>
    </div>
  );
} 