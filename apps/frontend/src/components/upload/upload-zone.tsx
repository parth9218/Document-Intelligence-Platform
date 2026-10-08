'use client';

import React, { useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useToast } from '@/components/ui/toast';
import { Upload, AlertCircle } from 'lucide-react';

export interface UploadZoneProps {
  onFilesSelected?: (files: File[]) => void;
}

export function UploadZone({ onFilesSelected }: UploadZoneProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  // Read active uploads count from Zustand store to enforce concurrency lock
  const documentRegistry = useAppStore((state) => state.documentRegistry);
  const localProgressQueue = useAppStore((state) => state.localProgressQueue);

  const documentList = Object.values(documentRegistry);
  const localUploadList = Object.values(localProgressQueue);

  const activeUploadsCount =
    documentList.filter((doc) => !['completed', 'failed', 'cancelled', 'expired'].includes(doc.status)).length +
    localUploadList.length;

  const isLocked = activeUploadsCount >= 5;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLocked) return;

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const processFiles = (filesList: FileList | null) => {
    if (isLocked || !filesList) return;

    const selectedFiles = Array.from(filesList);
    const validFiles: File[] = [];

    selectedFiles.forEach((file) => {
      // 1. MIME and Extension Checks
      const isValidMime = ['application/pdf', 'text/plain'].includes(file.type);
      const isValidExt = file.name.toLowerCase().endsWith('.pdf') || file.name.toLowerCase().endsWith('.txt');
      
      if (!isValidMime && !isValidExt) {
        toast({
          type: 'error',
          title: 'Invalid File Format',
          message: `Unsupported format for "${file.name}". Only PDF and TXT files are allowed.`,
        });
        return;
      }

      // 2. Sizing Checks (1B to 5MB)
      if (file.size <= 0) {
        toast({
          type: 'error',
          title: 'Empty File',
          message: `"${file.name}" is empty and cannot be processed.`,
        });
        return;
      }

      if (file.size > 5242880) {
        toast({
          type: 'error',
          title: 'File Too Large',
          message: `"${file.name}" exceeds the 5MB size limit (${(file.size / 1024 / 1024).toFixed(2)} MB).`,
        });
        return;
      }

      validFiles.push(file);
    });

    if (validFiles.length > 0) {
      if (onFilesSelected) {
        onFilesSelected(validFiles);
      } else {
        toast({
          type: 'success',
          title: 'Files Selected',
          message: `Successfully loaded ${validFiles.length} file(s) for uploading.`,
        });
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (isLocked) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const onButtonClick = () => {
    if (isLocked) return;
    fileInputRef.current?.click();
  };

  return (
    <div className="glass-panel p-6 rounded-2xl flex flex-col space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted select-none">
        Upload Files
      </h2>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.txt,application/pdf,text/plain"
        onChange={handleInputChange}
        className="hidden"
        disabled={isLocked}
      />

      {/* Interactive Drop Zone Area */}
      <div
        onClick={onButtonClick}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`border-2 border-dashed transition-all rounded-xl p-8 flex flex-col items-center justify-center space-y-3 bg-card-border/10 group select-none ${
          isLocked
            ? 'border-card-border/30 bg-card-border/5 cursor-not-allowed opacity-60'
            : isDragActive
            ? 'border-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.15)] cursor-pointer'
            : 'border-card-border/60 hover:border-cyan-500/40 hover:bg-card-border/20 cursor-pointer'
        }`}
      >
        <div
          className={`p-3 rounded-full border transition-all ${
            isLocked
              ? 'bg-card-border/20 border-card-border/25 text-muted'
              : isDragActive
              ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-600 dark:text-cyan-400 scale-105'
              : 'bg-card-border/30 dark:bg-slate-900/60 border-card-border/30 text-muted group-hover:scale-105 group-hover:text-cyan-600 dark:group-hover:text-cyan-400'
          }`}
        >
          <Upload className="w-6 h-6 animate-pulse" />
        </div>

        <div className="text-center">
          <span className={`text-sm font-semibold transition-colors ${isLocked ? 'text-muted' : 'text-foreground'}`}>
            {isLocked
              ? 'Upload Queue Locked'
              : isDragActive
              ? 'Drop files to upload'
              : 'Select documents to upload'}
          </span>
          <p className="text-xs text-muted mt-1.5">
            {isLocked ? 'Max concurrent uploads active' : 'PDF or Plain Text (max 5MB)'}
          </p>
        </div>
      </div>

      {/* Concurrency Lock Banner */}
      {isLocked && (
        <div className="flex items-start space-x-2.5 p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-xs font-medium leading-relaxed shadow-inner">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Concurrent Limit Reached</p>
            <p className="opacity-90">
              You currently have {activeUploadsCount} active uploads in queue. The system caps concurrent processing at a maximum of 5 files. Please wait for current files to finish processing.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
