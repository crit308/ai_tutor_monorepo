import React, { useState, useRef, useEffect } from 'react';
import { useAgentStreaming, useStreamingText } from '@/hooks/useAgentStreaming';
import { WhiteboardActivityIndicator } from '@/components/chat/WhiteboardActivityIndicator';
import LoadingSpinner from '@/components/LoadingSpinner';

interface AgentTutorChatProps {
  sessionId: string;
  className?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  timestamp: number;
}

const MessageBubble: React.FC<{ message: Message }> = ({ message }) => {
  const streamingText = useStreamingText(message.content);
  const displayText = message.isStreaming ? streamingText : message.content;

  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] p-3 rounded-lg shadow-sm ${
          message.role === 'user'
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 text-gray-800 border'
        }`}
      >
        <div className="text-xs font-semibold mb-1 opacity-70">
          {message.role === 'user' ? 'You' : 'AI Tutor'}
          {message.isStreaming && <span className="ml-1 animate-pulse text-blue-500">●</span>}
        </div>
        <div className="whitespace-pre-wrap">
          {displayText}
          {message.isStreaming && <span className="inline-block w-2 h-5 bg-current animate-pulse ml-1" />}
        </div>
      </div>
    </div>
  );
};

export default function AgentTutorChat({ sessionId, className = '' }: AgentTutorChatProps) {
  const [input, setInput] = useState('');
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages: agentMessages,
    sendMessage,
    isLoading,
    hasMoreMessages,
    loadMoreMessages,
    threadId,
    initializeThread,
  } = useAgentStreaming(sessionId);

  // Initialize thread on mount
  useEffect(() => {
    if (sessionId && !threadId) {
      initializeThread();
    }
  }, [sessionId, threadId, initializeThread]);

  // Convert agent messages to local format and merge with local messages
  useEffect(() => {
    const convertedMessages: Message[] = agentMessages.map((msg, index) => ({
      id: msg.key || `agent-${index}`,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: Date.now(), // Agent messages don't have timestamps, so use current time
      isStreaming: false, // Agent messages are already processed
    }));

    setLocalMessages(convertedMessages);
  }, [agentMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages]);

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    // Add user message immediately for optimistic UI
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmedInput,
      timestamp: Date.now(),
    };

    setLocalMessages(prev => [...prev, userMessage]);
    setInput('');

    // Add streaming placeholder for assistant
    const streamingMessage: Message = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };

    setLocalMessages(prev => [...prev, streamingMessage]);

    try {
      // Send message via agent system
      await sendMessage(trimmedInput);
      
      // Remove streaming placeholder since agent messages will be handled by useAgentStreaming
      setLocalMessages(prev => prev.filter(msg => msg.id !== streamingMessage.id));
    } catch (error) {
      console.error('Failed to send message:', error);
      
      // Update streaming message with error
      setLocalMessages(prev => 
        prev.map(msg => 
          msg.id === streamingMessage.id 
            ? { ...msg, content: 'Error: Failed to send message', isStreaming: false }
            : msg
        )
      );
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleLoadMore = () => {
    if (hasMoreMessages && loadMoreMessages) {
      // @ts-ignore - loadMore function from usePaginatedQuery
      loadMoreMessages();
    }
  };

  if (!threadId && isLoading) {
    return (
      <div className={`flex items-center justify-center h-64 ${className}`}>
        <LoadingSpinner />
        <span className="ml-2 text-gray-600">Initializing chat...</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full max-w-4xl mx-auto bg-white rounded-lg shadow-lg ${className}`}>
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b bg-gray-50 rounded-t-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">AI Tutor Chat</h2>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span>Connected • Session: {sessionId.slice(-8)}</span>
          </div>
        </div>
        {hasMoreMessages && (
          <button
            onClick={handleLoadMore}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Load earlier messages
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-grow overflow-y-auto p-4 space-y-2 bg-gray-50">
        {localMessages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <div className="text-4xl mb-2">💬</div>
            <p>Start a conversation with your AI tutor!</p>
            <p className="text-sm mt-1">Ask questions, get explanations, or discuss topics.</p>
          </div>
        ) : (
          localMessages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 p-4 border-t bg-white rounded-b-lg">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isLoading ? "AI is thinking..." : "Type your message or question..."}
            disabled={isLoading}
            className="flex-1 p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            rows={2}
            maxLength={1000}
          />
          <div className="flex flex-col gap-2">
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1"></div>
                  Sending
                </div>
              ) : (
                'Send'
              )}
            </button>
            <div className="text-xs text-gray-500 text-center">
              {input.length}/1000
            </div>
          </div>
        </div>
        
        {/* Status indicator */}
        <div className="mt-2 text-xs text-gray-500 flex items-center">
          {isLoading && (
            <>
              <WhiteboardActivityIndicator />
              <span className="ml-1">AI is responding...</span>
            </>
          )}
          {!isLoading && threadId && (
            <span>Ready • Thread: {threadId.slice(-8)}</span>
          )}
        </div>
      </div>
    </div>
  );
} 