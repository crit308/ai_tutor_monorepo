import { useMutation, useQuery } from "convex/react";
import { api } from "convex_generated/api";
import {
  useThreadMessages,
  useSmoothText,
  optimisticallySendMessage,
  toUIMessages,
} from "@convex-dev/agent/react";
import { useState, useCallback } from "react";

/**
 * Hook for managing agent-based streaming chat in the AI tutor
 */
export function useAgentStreaming(sessionId: string) {
  const [threadId, setThreadId] = useState<string | null>(null);
  
  // Get or create thread for this session
  const getOrCreateThread = useMutation(api.getOrCreateSessionThread);
  const sendMessage = useMutation(api.sendStreamingMessage);
  
  // Initialize thread
  const initializeThread = useCallback(async () => {
    if (!threadId && sessionId) {
      const newThreadId = await getOrCreateThread({ sessionId });
      setThreadId(newThreadId);
      return newThreadId;
    }
    return threadId;
  }, [sessionId, threadId, getOrCreateThread]);
  
  // Get messages with streaming support
  const messages = useThreadMessages(
    api.listThreadMessages,
    threadId ? { threadId } : "skip",
    { 
      initialNumItems: 20,
      stream: true,
    }
  );
  
  // Convert to UI messages
  const uiMessages = messages.results ? toUIMessages(messages.results) : [];
  
  // Send message with optimistic updates
  const sendMessageWithOptimistic = useMutation(api.sendStreamingMessage)
    .withOptimisticUpdate(
      optimisticallySendMessage(api.listThreadMessages)
    );
  
  const handleSendMessage = useCallback(async (messageText: string) => {
    const currentThreadId = await initializeThread();
    if (currentThreadId) {
      await sendMessageWithOptimistic({
        threadId: currentThreadId,
        message: messageText,
        sessionId,
      });
    }
  }, [sessionId, initializeThread, sendMessageWithOptimistic]);
  
  return {
    messages: uiMessages,
    sendMessage: handleSendMessage,
    isLoading: !threadId,
    hasMoreMessages: !messages.isDone,
    loadMoreMessages: messages.loadMore,
    threadId,
    initializeThread,
  };
}

/**
 * Hook for displaying streaming text with smooth animation
 */
export function useStreamingText(content: string) {
  const [visibleText] = useSmoothText(content);
  return visibleText;
} 