'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { connectToProgressSSE } from '../lib/sse-client';
import { apiClient } from '../lib/api-client';
import { type DocumentStatusObject } from '../types/api';

/**
 * Custom hook to track real-time document ingestion progress.
 * 
 * Sets up an EventSource connection to the backend SSE endpoint.
 * On connection failure, falls back to polling the status endpoint every 3 seconds.
 * Cleans up connections and polling loops automatically when all documents reach terminal states.
 */
export function useIngestion() {
  const [isConnected, setIsConnected] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [hasFetchedSnapshot, setHasFetchedSnapshot] = useState(false);

  const documentRegistry = useAppStore((state) => state.documentRegistry);
  const localProgressQueue = useAppStore((state) => state.localProgressQueue);
  const setDocumentRegistry = useAppStore((state) => state.setDocumentRegistry);
  const updateDocumentStatus = useAppStore((state) => state.updateDocumentStatus);

  const documents = Object.values(documentRegistry);
  const localUploadList = Object.values(localProgressQueue);

  // Compute active background ingestion jobs
  const activeBackendCount = documents.filter(
    (doc) => !['completed', 'failed', 'expired', 'cancelled'].includes(doc.status)
  ).length;

  // Compute active local upload jobs
  const activeLocalCount = localUploadList.length;

  // Establish SSE connection if:
  // 1. Initial snapshot has not yet been fetched on mount.
  // 2. Or there are active uploads in progress locally.
  // 3. Or there are active backend processing jobs.
  const shouldConnect = !hasFetchedSnapshot || activeLocalCount > 0 || activeBackendCount > 0;

  useEffect(() => {
    if (!shouldConnect) {
      return;
    }

    let eventSource: EventSource | null = null;
    let pollingInterval: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (pollingInterval) return;
      setIsPolling(true);

      const poll = async () => {
        try {
          const response = await apiClient<{ documents: DocumentStatusObject[] }>(
            'documents',
            '/api/documents/status'
          );
          const nextRegistry: Record<string, DocumentStatusObject> = {};
          response.documents.forEach((doc) => {
            nextRegistry[doc.documentId] = doc;
          });
          setDocumentRegistry(nextRegistry);
          setHasFetchedSnapshot(true);
        } catch (err) {
          console.error('Ingestion polling fallback failed:', err);
        }
      };

      poll();
      pollingInterval = setInterval(poll, 3000);
    };

    const stopPolling = () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
      setIsPolling(false);
    };

    const connect = () => {
      setIsConnected(true);

      eventSource = connectToProgressSSE({
        onSnapshot: (data) => {
          const nextRegistry: Record<string, DocumentStatusObject> = {};
          data.forEach((doc) => {
            nextRegistry[doc.documentId] = doc;
          });
          setDocumentRegistry(nextRegistry);
          setHasFetchedSnapshot(true);
          stopPolling();
        },
        onUpdate: (doc) => {
          updateDocumentStatus(doc.documentId, doc);
        },
        onOpen: () => {
          setIsConnected(true);
          stopPolling();
        },
        onError: (err) => {
          console.warn('SSE connection error, starting fallback polling:', err);
          setIsConnected(false);
          startPolling();
        },
      });
    };

    connect();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      stopPolling();
      setIsConnected(false);
    };
  }, [shouldConnect, setDocumentRegistry, updateDocumentStatus]);

  return {
    isConnected,
    isPolling,
    activeCount: activeBackendCount + activeLocalCount,
  };
}
