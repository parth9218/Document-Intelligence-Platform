'use client';

import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { DocumentCard } from './document-card';
import { Loader2 } from 'lucide-react';

/**
 * ProcessingFeed displays both active local upload states (S3 writes)
 * and the document inventory registry from the backend.
 */
export function ProcessingFeed() {
  const documentRegistry = useAppStore((state) => state.documentRegistry);
  const localProgressQueue = useAppStore((state) => state.localProgressQueue);

  const documentList = Object.values(documentRegistry);
  const localUploadList = Object.values(localProgressQueue);
  const totalCount = documentList.length + localUploadList.length;

  if (totalCount === 0) {
    return null;
  }

  const getLocalStatusLabel = (status: string) => {
    switch (status) {
      case 'initializing':
        return 'Initializing';
      case 'uploading':
        return 'Uploading to S3';
      case 'confirming':
        return 'Verifying Upload';
      default:
        return status;
    }
  };

  return (
    <div className="glass-panel p-6 rounded-2xl flex-1 flex flex-col space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted select-none">
        Processing Queue & Documents ({totalCount})
      </h2>

      {/* Document Feed Board */}
      <div className="flex flex-col space-y-3.5 max-h-[550px] overflow-y-auto pr-1 scrollbar-thin">
        {/* Local S3 Upload Queue Items */}
        {localUploadList.map((upload, idx) => (
          <div
            key={`local-upload-${idx}`}
            className="p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 flex flex-col space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center space-x-3 overflow-hidden">
                <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 flex-shrink-0">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
                <div className="overflow-hidden">
                  <h4 className="text-sm font-semibold text-foreground truncate select-all">
                    {upload.filename}
                  </h4>
                  <p className="text-xs text-cyan-600 dark:text-cyan-400 font-medium capitalize mt-0.5">
                    {getLocalStatusLabel(upload.status)}...
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 select-none">
                {upload.status}
              </span>
            </div>

            {/* Progress Slider */}
            <div className="flex items-center space-x-2">
              <div className="flex-1 bg-slate-200 dark:bg-slate-950 rounded-full h-1.5 overflow-hidden border border-card-border/20">
                <div
                  className="bg-cyan-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${upload.progressPct}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold font-mono text-cyan-600 dark:text-cyan-400">
                {upload.progressPct}%
              </span>
            </div>
          </div>
        ))}

        {/* Backend Processing / Completed / Failed Documents */}
        {documentList.map((doc) => (
          <DocumentCard key={doc.documentId} doc={doc} />
        ))}
      </div>
    </div>
  );
}
