'use client';

import React from 'react';
import { type DocumentStatusObject } from '@/types/api';
import { useAppStore } from '@/store/useAppStore';
import { useToast } from '@/components/ui/toast';
import { FileText, AlertCircle, RefreshCw, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DocumentCardProps {
  doc: DocumentStatusObject;
}

export function DocumentCard({ doc }: DocumentCardProps) {
  const removeDocument = useAppStore((state) => state.removeDocument);
  const { toast } = useToast();

  const isFailed = doc.status === 'failed' || doc.status === 'expired' || doc.status === 'cancelled';
  const isCompleted = doc.status === 'completed';
  const isProcessing = ['downloading', 'validating', 'extracting', 'chunking', 'embedding', 'uploaded'].includes(
    doc.status
  );

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending_upload':
        return 'Pending Upload';
      case 'uploaded':
        return 'Uploaded';
      case 'downloading':
        return 'Downloading';
      case 'validating':
        return 'Validating';
      case 'extracting':
        return 'Extracting';
      case 'chunking':
        return 'Chunking';
      case 'embedding':
        return 'Embedding';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'expired':
        return 'Expired';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const getSubStageMessage = () => {
    if (doc.status === 'chunking') {
      const current = doc.processedChunks;
      const total = doc.totalChunks || '?';
      return `Chunking (${current} of ${total} chunks)...`;
    }
    if (doc.status === 'embedding') {
      return `Embedding (${doc.progressPct}% complete)...`;
    }
    if (isProcessing) {
      return `${getStatusLabel(doc.status)} (${doc.progressPct}%)...`;
    }
    return null;
  };

  const handleDismiss = () => {
    removeDocument(doc.documentId);
    toast({
      type: 'info',
      message: `Removed "${doc.filename}" from processing history.`,
    });
  };

  const handleRetry = () => {
    // Remove the failed document card
    removeDocument(doc.documentId);
    
    // Alert the user to re-upload the file
    toast({
      type: 'info',
      title: 'Retry Upload',
      message: `Please drop or select the file "${doc.filename}" again to retry ingestion.`,
      duration: 5000,
    });
  };

  return (
    <div
      className={cn(
        'p-4 rounded-xl border transition-all duration-300 bg-card/40 flex flex-col space-y-3.5',
        {
          // Warning/red glow for failed/expired items
          'border-rose-500/40 bg-rose-500/5 shadow-[0_0_12px_rgba(239,68,68,0.1)]': isFailed,
          'border-emerald-500/30 bg-emerald-500/5': isCompleted,
          'border-card-border/40 hover:border-cyan-500/30': !isFailed && !isCompleted,
        }
      )}
    >
      {/* Top row: Icon, Details, and Status tag */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center space-x-3 overflow-hidden">
          <div
            className={cn(
              'p-2.5 rounded-lg border flex-shrink-0 transition-colors',
              {
                'bg-rose-500/10 text-rose-500 border-rose-500/20': isFailed,
                'bg-emerald-500/10 text-emerald-500 border-emerald-500/20': isCompleted,
                'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20': isProcessing,
                'bg-card-border/30 dark:bg-slate-900/60 text-muted border-card-border/30':
                  !isFailed && !isCompleted && !isProcessing,
              }
            )}
          >
            {isFailed ? (
              <AlertCircle className="w-4 h-4" />
            ) : isCompleted ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
          </div>
          <div className="overflow-hidden">
            <h4 className="text-sm font-semibold text-foreground truncate select-all">
              {doc.filename}
            </h4>
            <p className="text-xs text-muted font-mono mt-0.5">
              {formatSize(doc.fileSizeBytes || 0)}
            </p>
          </div>
        </div>

        {/* Status tag */}
        <span
          className={cn(
            'px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border select-none',
            {
              'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20': isCompleted,
              'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20': isFailed,
              'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20': isProcessing,
              'bg-slate-500/10 text-muted border-slate-500/20': !isCompleted && !isFailed && !isProcessing,
            }
          )}
        >
          {getStatusLabel(doc.status)}
        </span>
      </div>

      {/* Dynamic Sub-Stage Message or Error message */}
      {isFailed && (
        <div className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/15 text-xs text-rose-600 dark:text-rose-400 font-medium leading-relaxed">
          <p className="font-semibold uppercase tracking-wider text-[9px] opacity-75 mb-0.5">
            Error: {doc.errorCode || 'Ingestion Failed'}
          </p>
          <p className="opacity-90">{doc.errorMessage || 'An error occurred during background ingestion.'}</p>
        </div>
      )}

      {/* Substage Progress label */}
      {!isFailed && getSubStageMessage() && (
        <div className="text-xs text-cyan-600 dark:text-cyan-400 font-semibold tracking-wide">
          {getSubStageMessage()}
        </div>
      )}

      {/* Bottom row: Progress Bars & Action Buttons */}
      <div className="flex items-center justify-between gap-4">
        {/* Progress Bar (only show for active processing / completing) */}
        {isProcessing && (
          <div className="flex-1 flex items-center space-x-2">
            <div className="flex-1 bg-slate-200 dark:bg-slate-950 rounded-full h-1.5 overflow-hidden border border-card-border/20">
              <div
                className="bg-cyan-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${doc.progressPct}%` }}
              />
            </div>
            <span className="text-[10px] font-semibold font-mono text-cyan-600 dark:text-cyan-400">
              {doc.progressPct}%
            </span>
          </div>
        )}

        {/* Failed Action Buttons */}
        {isFailed && (
          <div className="flex-1 flex items-center justify-end space-x-2.5">
            <button
              onClick={handleDismiss}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-card-border hover:bg-card-border/20 text-muted hover:text-foreground text-xs font-semibold tracking-wide transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Dismiss</span>
            </button>
            <button
              onClick={handleRetry}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/35 text-xs font-bold tracking-wide transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
