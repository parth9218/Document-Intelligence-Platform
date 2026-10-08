import { getEndpointUrl } from './api-client';

export interface SSEConnectionOptions {
  onSnapshot?: (data: any[]) => void;
  onUpdate?: (data: any) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
}

/**
 * Connects to the SSE progress tracking endpoint at `GET /api/documents/progress`
 * using the browser's native EventSource API.
 */
export function connectToProgressSSE({
  onSnapshot,
  onUpdate,
  onError,
  onOpen,
}: SSEConnectionOptions = {}): EventSource {
  // Resolve path depending on routing mode ('api' vs 'mock')
  const url = getEndpointUrl('progress', '/api/documents/progress');
  const eventSource = new EventSource(url, { withCredentials: true });

  if (onOpen) {
    eventSource.onopen = () => {
      onOpen();
    };
  }

  if (onSnapshot) {
    eventSource.addEventListener('snapshot', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        onSnapshot(data);
      } catch (err) {
        console.error('Failed to parse SSE snapshot payload:', err);
      }
    });
  }

  if (onUpdate) {
    eventSource.addEventListener('update', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        onUpdate(data);
      } catch (err) {
        console.error('Failed to parse SSE update payload:', err);
      }
    });
  }

  if (onError) {
    eventSource.onerror = (error) => {
      onError(error);
    };
  }

  return eventSource;
}
