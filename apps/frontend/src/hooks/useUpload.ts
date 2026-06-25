'use client';

import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useToast } from '../components/ui/toast';
import { apiClient } from '../lib/api-client';
import { type BatchUploadInitResponse, type BatchUploadInitResultReady, type ConfirmUploadResponse } from '../types/api';

export function useUpload() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const setLocalProgress = useAppStore((state) => state.setLocalProgress);
  const updateLocalProgressPct = useAppStore((state) => state.updateLocalProgressPct);
  const clearLocalProgress = useAppStore((state) => state.clearLocalProgress);
  const updateDocumentStatus = useAppStore((state) => state.updateDocumentStatus);

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);

    try {
      // 1. Group selected files and call initialize uploads
      const payload = {
        documents: files.map((file) => ({
          filename: file.name,
          mimeType: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'text/plain'),
          fileSizeBytes: file.size,
        })),
      };

      const response = await apiClient<BatchUploadInitResponse>('documents', '/api/documents', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const results = response.results;

      // 2. Queue Classification
      const readyItems: { result: BatchUploadInitResultReady; file: File }[] = [];

      results.forEach((item) => {
        if (item.status === 'rejected') {
          // Add rejected items directly to documentRegistry with failed state & error mappings
          const mockId = `rejected-${item.filename}-${Date.now()}`;
          updateDocumentStatus(mockId, {
            documentId: mockId,
            filename: item.filename,
            mimeType: 'text/plain',
            fileSizeBytes: 0,
            status: 'failed',
            progressPct: 0,
            processedChunks: 0,
            totalChunks: null,
            errorCode: item.error,
            errorMessage: item.message,
            createdAt: new Date().toISOString(),
          });
        } else if (item.status === 'ready') {
          // Find matching File object
          const matchingFile = files.find((f) => f.name === item.filename);
          if (matchingFile) {
            readyItems.push({ result: item, file: matchingFile });
            
            // Add to localProgressQueue
            setLocalProgress(item.documentId, {
              filename: item.filename,
              progressPct: 0,
              status: 'initializing',
            });
          }
        }
      });

      // 3. Concurrency Limit Execution (Max 5 parallel uploads)
      const CONCURRENCY_LIMIT = 5;
      const tasks = [...readyItems];
      let activeCount = 0;

      const executeTask = async (task: { result: BatchUploadInitResultReady; file: File }) => {
        const { result, file } = task;
        try {
          setLocalProgress(result.documentId, {
            filename: result.filename,
            progressPct: 0,
            status: 'uploading',
          });

          // Simulate progress updates for Task F3.2 (will be replaced by XHR/fetch in F3.3)
          for (let pct = 10; pct <= 100; pct += 10) {
            await new Promise((resolve) => setTimeout(resolve, 150));
            updateLocalProgressPct(result.documentId, pct);
          }

          setLocalProgress(result.documentId, {
            filename: result.filename,
            progressPct: 100,
            status: 'confirming',
          });

          // Call API confirm-upload route
          await apiClient<ConfirmUploadResponse>('documents', `/api/documents/${result.documentId}/confirm-upload`, {
            method: 'POST',
          });

          // Successfully confirmed, clear local progress (SSE progress listener will take over updates)
          clearLocalProgress(result.documentId);
        } catch (err) {
          console.error(`Upload failed for ${result.filename}`, err);
          
          // Clear local progress and set failed status in document registry
          clearLocalProgress(result.documentId);
          updateDocumentStatus(result.documentId, {
            documentId: result.documentId,
            filename: result.filename,
            mimeType: file.type || 'text/plain',
            fileSizeBytes: file.size,
            status: 'failed',
            progressPct: 0,
            processedChunks: 0,
            totalChunks: null,
            errorCode: 'upload_failure',
            errorMessage: err instanceof Error ? err.message : 'Upload failed',
            createdAt: new Date().toISOString(),
          });
        }
      };

      const runNext = async () => {
        if (tasks.length === 0) return;
        if (activeCount >= CONCURRENCY_LIMIT) return;

        const nextTask = tasks.shift()!;
        activeCount++;

        await executeTask(nextTask);

        activeCount--;
        await runNext();
      };

      // Kick off initial batch up to concurrency limit
      const initialBatch = [];
      for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, readyItems.length); i++) {
        initialBatch.push(runNext());
      }
      await Promise.all(initialBatch);

    } catch (err: any) {
      setError(err.message || 'Failed to initialize batch upload');
      
      // Quota/Concurrency Interceptor alerts user on batch failures
      toast({
        type: 'error',
        title: 'Upload Rejected',
        message: err.message || 'Storage quota or concurrency limit exceeded.',
      });
    } finally {
      setUploading(false);
    }
  };

  const clearError = () => setError(null);

  return {
    uploading,
    error,
    clearError,
    uploadFiles,
  };
}
