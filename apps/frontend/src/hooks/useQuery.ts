import { useState, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getEndpointUrl } from '../lib/api-client';
import { type SearchResultChunk, type CitationMeta, type ChatMessage } from '../types/api';

export function useQuery() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const addChatMessage = useAppStore((state) => state.addChatMessage);
  const updateChatMessage = useAppStore((state) => state.updateChatMessage);
  const clearChatMessages = useAppStore((state) => state.clearChatMessages);

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const submitQuery = useCallback(
    async (queryText: string) => {
      const trimmed = queryText.trim();
      if (!trimmed || isStreaming) return;

      setError(null);
      setIsStreaming(true);

      const timestamp = new Date().toISOString();
      const userMsgId = `user-${Date.now()}`;
      const assistantMsgId = `assistant-${Date.now()}`;

      // 1. Add User Message
      const userMsg: ChatMessage = {
        id: userMsgId,
        role: 'user',
        content: trimmed,
        createdAt: timestamp,
      };
      addChatMessage(userMsg);

      // 2. Add initial Assistant Message
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        contextChunks: [],
        citations: [],
        createdAt: timestamp,
      };
      addChatMessage(assistantMsg);

      // Create AbortController for stream cancellation
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const url = getEndpointUrl('query', '/api/query/search');
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ query: trimmed, stream: true }),
          credentials: 'include',
          signal: controller.signal,
        });

        if (!response.ok) {
          let errMsg = `Server returned HTTP ${response.status}`;
          try {
            const data = await response.json();
            if (data.error) errMsg = data.error;
            if (data.message) errMsg = data.message;
          } catch {
            // fallback
          }
          throw new Error(errMsg);
        }

        if (!response.body) {
          throw new Error('Response body is null');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = 'message';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            if (trimmedLine.startsWith('event:')) {
              currentEvent = trimmedLine.slice(6).trim();
              continue;
            }

            if (trimmedLine.startsWith('data:')) {
              const dataStr = trimmedLine.slice(5).trim();

              if (dataStr === '[DONE]' || currentEvent === 'done') {
                updateChatMessage(assistantMsgId, (prev) => ({
                  ...prev,
                  isStreaming: false,
                }));
                break;
              }

              try {
                const parsed = JSON.parse(dataStr);

                if (currentEvent === 'context') {
                  const chunks: SearchResultChunk[] = parsed.results || [];
                  updateChatMessage(assistantMsgId, (prev) => ({
                    ...prev,
                    contextChunks: chunks,
                  }));
                } else if (currentEvent === 'token') {
                  const token: string = parsed.token || '';
                  if (token) {
                    updateChatMessage(assistantMsgId, (prev) => ({
                      ...prev,
                      content: prev.content + token,
                    }));
                  }
                } else if (currentEvent === 'citation') {
                  const citation: CitationMeta = parsed;
                  updateChatMessage(assistantMsgId, (prev) => {
                    const exists = (prev.citations || []).some(
                      (c) => c.index === citation.index,
                    );
                    return {
                      ...prev,
                      citations: exists ? prev.citations : [...(prev.citations || []), citation],
                    };
                  });
                } else if (currentEvent === 'error') {
                  updateChatMessage(assistantMsgId, (prev) => ({
                    ...prev,
                    error: parsed.message || 'Streaming error occurred',
                    isStreaming: false,
                  }));
                }
              } catch {
                // Skip unparseable JSON
              }
            }
          }
        }

        // Stream completed cleanly
        updateChatMessage(assistantMsgId, (prev) => ({
          ...prev,
          isStreaming: false,
        }));
      } catch (err: any) {
        if (err.name === 'AbortError') {
          updateChatMessage(assistantMsgId, (prev) => ({
            ...prev,
            isStreaming: false,
          }));
        } else {
          const message = err.message || 'Failed to communicate with search API';
          setError(message);
          updateChatMessage(assistantMsgId, (prev) => ({
            ...prev,
            error: message,
            isStreaming: false,
          }));
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [addChatMessage, updateChatMessage, isStreaming],
  );

  return {
    isStreaming,
    error,
    submitQuery,
    abortStream,
    clearChat: clearChatMessages,
  };
}
