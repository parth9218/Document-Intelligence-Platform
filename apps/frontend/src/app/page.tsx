'use client';

import React, { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { EmptyState } from '@/components/documents/empty-state';
import { UploadZone } from '@/components/upload/upload-zone';
import { ProcessingFeed } from '@/components/documents/processing-feed';
import { ChatInterface } from '@/components/chat/chat-interface';
import { useUpload } from '@/hooks/useUpload';
import { useIngestion } from '@/hooks/useIngestion';
import { HardDrive, Cpu, AlertCircle, RefreshCw, Files, MessageSquare } from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'documents' | 'chat'>('documents');
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Intelligence Workspace
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
            Upload PDF documents, monitor worker ingestion, and stream grounded Q&A.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* High-Contrast Workspace View Switcher Tabs */}
          <div
            role="tablist"
            aria-label="Workspace views"
            className="flex items-center p-1.5 rounded-2xl border shadow-inner transition-all
              bg-slate-200/90 border-slate-300
              dark:bg-slate-900 dark:border-slate-800"
          >
            <button
              id="tab-documents"
              role="tab"
              type="button"
              aria-selected={activeTab === 'documents'}
              aria-controls="panel-documents"
              onClick={() => setActiveTab('documents')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
                activeTab === 'documents'
                  ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md'
                  : 'text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-300/60 dark:hover:bg-slate-800'
              }`}
            >
              <Files className="w-4 h-4" aria-hidden="true" />
              <span>Documents ({documentList.length})</span>
            </button>
            <button
              id="tab-chat"
              role="tab"
              type="button"
              aria-selected={activeTab === 'chat'}
              aria-controls="panel-chat"
              onClick={() => setActiveTab('chat')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
                activeTab === 'chat'
                  ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md'
                  : 'text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-300/60 dark:hover:bg-slate-800'
              }`}
            >
              <MessageSquare className="w-4 h-4" aria-hidden="true" />
              <span>Ask Assistant</span>
            </button>
          </div>

          {hasDocuments && (
            <button
              type="button"
              onClick={handleResetSession}
              aria-label="Clear session cache"
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-rose-500/40
                bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100
                dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/80 dark:hover:bg-rose-900/60"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset Session</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Tab View Container */}
      {activeTab === 'documents' ? (
        <div id="panel-documents" role="tabpanel" aria-labelledby="tab-documents" className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 items-start">
          {/* Left Column: List Feed / Empty Onboarding (takes 2 cols on lg screens) */}
          <div className="lg:col-span-2 flex flex-col h-full min-h-[400px]">
            {!hasDocuments ? <EmptyState /> : <ProcessingFeed />}
          </div>

          {/* Right Column: Upload Zone and Limits (1 col on lg screens) */}
          <div className="flex flex-col space-y-6">
            {/* Interactive Upload Zone */}
            <UploadZone onFilesSelected={uploadFiles} />

            {/* Session Limit Tracker Panel */}
            <div className="p-6 rounded-2xl flex flex-col space-y-5 border shadow-lg transition-all
              bg-white text-slate-900 border-slate-200 shadow-slate-200/40
              dark:bg-slate-900/95 dark:text-slate-100 dark:border-slate-800 dark:shadow-black/50">
              
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none">
                Session Limits
              </h2>

              {/* Storage Quota Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <div className="flex items-center space-x-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
                    <span>Storage Quota</span>
                  </div>
                  <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                    {formatSize(totalUsedBytes)} / 50.00 MB
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-300 dark:border-slate-800">
                  <div
                    className="bg-gradient-to-r from-cyan-600 to-indigo-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${storagePercentage}%` }}
                  />
                </div>
              </div>

              {/* Concurrency Slots Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <div className="flex items-center space-x-1.5">
                    <Cpu className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
                    <span>Active Uploads</span>
                  </div>
                  <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                    {activeUploadsCount} / 5 slots
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-300 dark:border-slate-800">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-300 bg-gradient-to-r ${
                      activeUploadsCount >= 5 ? 'from-rose-500 to-red-600 animate-pulse' : 'from-cyan-600 to-indigo-600'
                    }`}
                    style={{ width: `${(activeUploadsCount / 5) * 100}%` }}
                  />
                </div>
                {activeUploadsCount >= 5 && (
                  <div className="flex items-center space-x-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                    <span>Slots full. Wait for processes to finish.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Chat Q&A Tab View */
        <div id="panel-chat" role="tabpanel" aria-labelledby="tab-chat" className="flex-1">
          <ChatInterface />
        </div>
      )}

      {/* Concurrency / Quota Error Dialog Modal */}
      {uploadError && (
        <div role="dialog" aria-modal="true" aria-labelledby="upload-error-title" className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300">
          <div className="p-6 rounded-2xl max-w-md w-full mx-4 border shadow-2xl space-y-4
            bg-white text-slate-900 border-red-300
            dark:bg-slate-900 dark:text-slate-100 dark:border-red-800">
            <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
              <AlertCircle className="w-6 h-6 flex-shrink-0" aria-hidden="true" />
              <h3 id="upload-error-title" className="text-lg font-bold tracking-tight">Upload Rejected</h3>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium">{uploadError}</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={clearError}
                aria-label="Dismiss error modal"
                className="px-4 py-2 rounded-xl font-semibold text-xs border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/40
                  bg-red-50 text-red-700 border-red-300 hover:bg-red-100
                  dark:bg-red-950/60 dark:text-red-300 dark:border-red-800 dark:hover:bg-rose-900/60"
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
