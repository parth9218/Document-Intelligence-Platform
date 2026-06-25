'use client';

import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { EmptyState } from '@/components/documents/empty-state';
import { UploadZone } from '@/components/upload/upload-zone';
import { ProcessingFeed } from '@/components/documents/processing-feed';
import { useUpload } from '@/hooks/useUpload';
import { useIngestion } from '@/hooks/useIngestion';
import { HardDrive, Cpu, AlertCircle, RefreshCw } from 'lucide-react';

export default function Home() {
  const { uploadFiles, error: uploadError, clearError } = useUpload();
  useIngestion(); // Initialize real-time ingestion progress monitoring
  const documentRegistry = useAppStore((state) => state.documentRegistry);
  const localProgressQueue = useAppStore((state) => state.localProgressQueue);
  const clearRegistry = useAppStore((state) => state.clearDocumentRegistry);
  const clearAllLocal = useAppStore((state) => state.clearAllLocalProgress);

  const documentList = Object.values(documentRegistry);
  const localUploadList = Object.values(localProgressQueue);
  const hasDocuments = documentList.length > 0 || localUploadList.length > 0;

  // Compute live quota and concurrency stats
  const activeUploadsCount =
    documentList.filter((doc) => !['completed', 'failed', 'cancelled', 'expired'].includes(doc.status)).length +
    localUploadList.length;

  const totalUsedBytes = documentList.reduce((acc, doc) => {
    if (['expired', 'failed', 'cancelled'].includes(doc.status)) {
      return acc;
    }
    return acc + Number(doc.fileSizeBytes);
  }, 0);

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const storagePercentage = Math.min((totalUsedBytes / 52428800) * 100, 100);

  const handleResetSession = () => {
    clearRegistry();
    clearAllLocal();
  };

  return (
    <div className="flex-1 flex flex-col space-y-6 font-sans">
      {/* Top Console Dashboard Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Document Hub</h1>
          <p className="text-sm text-muted">Manage, index, and monitor documents inside this session.</p>
        </div>
        {hasDocuments && (
          <button
            onClick={handleResetSession}
            className="flex items-center space-x-2 px-3.5 py-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-sm font-semibold tracking-wide transition-all cursor-pointer self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Clear Session Cache</span>
          </button>
        )}
      </div>

      {/* Main Responsive Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 items-start">
        {/* Left Column: List Feed / Empty Onboarding (takes 2 cols on lg screens) */}
        <div className="lg:col-span-2 flex flex-col h-full min-h-[400px]">
          {!hasDocuments ? <EmptyState /> : <ProcessingFeed />}
        </div>

        {/* Right Column: Upload Zone and Limits (1 col on lg screens) */}
        <div className="flex flex-col space-y-6">
          {/* Interactive Upload Zone */}
          <UploadZone onFilesSelected={uploadFiles} />

          {/* Session Limit Tracker Panel */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col space-y-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted select-none">
              Session Limits
            </h2>
            
            {/* Storage Quota Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-1.5 text-foreground">
                  <HardDrive className="w-3.5 h-3.5 text-muted" />
                  <span>Storage Quota</span>
                </div>
                <span className="font-mono text-xs text-muted">
                  {formatSize(totalUsedBytes)} / 50.00 MB
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-950 rounded-full h-2 overflow-hidden border border-card-border/20">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${storagePercentage}%` }}
                />
              </div>
            </div>

            {/* Concurrency Slots Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-1.5 text-foreground">
                  <Cpu className="w-3.5 h-3.5 text-muted" />
                  <span>Active Uploads</span>
                </div>
                <span className="font-mono text-xs text-muted">
                  {activeUploadsCount} / 5 slots
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-950 rounded-full h-2 overflow-hidden border border-card-border/20">
                <div
                  className={`h-2 rounded-full transition-all duration-300 bg-gradient-to-r ${
                    activeUploadsCount >= 5 ? 'from-rose-500 to-red-600 animate-pulse' : 'from-cyan-500 to-indigo-500'
                  }`}
                  style={{ width: `${(activeUploadsCount / 5) * 100}%` }}
                />
              </div>
              {activeUploadsCount >= 5 && (
                <div className="flex items-center space-x-1 text-xs text-rose-600 dark:text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Slots full. Wait for processes to finish.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Concurrency / Quota Error Dialog Modal */}
      {uploadError && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300">
          <div className="glass-panel p-6 rounded-2xl max-w-md w-full mx-4 border border-red-500/30 bg-red-950/20 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-red-500">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-lg font-bold tracking-tight">Upload Rejected</h3>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              {uploadError}
            </p>
            <div className="flex justify-end">
              <button
                onClick={clearError}
                className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 text-sm font-semibold tracking-wide transition-all cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
