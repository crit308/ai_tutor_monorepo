import { useState, useCallback, useRef } from 'react';
import { useAuthToken } from '@convex-dev/auth/react';

interface StreamingMessage {
  id: string;
  role: 'assistant';
  content: string;
  isStreaming: boolean;
  isComplete: boolean;
}

interface UseHttpTutorStreamProps {
  sessionId: string;
  onMessage?: (message: StreamingMessage) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

export function useHttpTutorStream({ 
  sessionId, 
  onMessage, 
  onError, 
  onComplete 
}: UseHttpTutorStreamProps) {
  const [streamingMessage, setStreamingMessage] = useState<StreamingMessage | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useAuthToken();
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (message: string, userId: string) => {
    if (!token || !sessionId || !message.trim()) {
      onError?.('Missing required parameters');
      return;
    }

    // Clean up any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      setError(null);
      setIsStreaming(true);
      
      // Create initial streaming message
      const messageId = `stream_${Date.now()}`;
      const initialMessage: StreamingMessage = {
        id: messageId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        isComplete: false
      };
      
      setStreamingMessage(initialMessage);
      onMessage?.(initialMessage);

      // Get Convex site URL for HTTP actions
      const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_URL!.replace(/\.cloud$/, '.site');
      
      console.log('[HTTP Stream] Connecting to:', `${convexSiteUrl}/stream-chat`);

      const response = await fetch(`${convexSiteUrl}/stream-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          message: message.trim(),
          userId
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Read the streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        
        if (chunk) {
          setStreamingMessage(prev => {
            if (!prev) return null;
            
            const updated: StreamingMessage = {
              ...prev,
              content: prev.content + chunk,
              isStreaming: true,
              isComplete: false
            };
            
            onMessage?.(updated);
            return updated;
          });
        }
      }

      // Mark as complete
      setStreamingMessage(prev => {
        if (!prev) return null;
        
        const completed: StreamingMessage = {
          ...prev,
          isStreaming: false,
          isComplete: true
        };
        
        onMessage?.(completed);
        onComplete?.();
        return completed;
      });

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[HTTP Stream] Request aborted');
        return;
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[HTTP Stream] Error:', errorMessage);
      
      setError(errorMessage);
      onError?.(errorMessage);
      
      // Update streaming message with error
      setStreamingMessage(prev => {
        if (!prev) return null;
        
        return {
          ...prev,
          content: prev.content + `\n\nError: ${errorMessage}`,
          isStreaming: false,
          isComplete: true
        };
      });
      
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [token, sessionId, onMessage, onError, onComplete]);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  }, []);

  const clearStreamingMessage = useCallback(() => {
    setStreamingMessage(null);
    setError(null);
  }, []);

  return {
    sendMessage,
    stopStreaming,
    clearStreamingMessage,
    streamingMessage,
    isStreaming,
    error,
    isConnected: true // HTTP doesn't need persistent connection
  };
} 