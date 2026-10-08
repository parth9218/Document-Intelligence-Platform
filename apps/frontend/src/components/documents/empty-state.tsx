'use client';

import React from 'react';
import { UploadCloud, FileText, CheckCircle2, ShieldAlert, AlertTriangle } from 'lucide-react';

export function EmptyState() {
  const guidelines = [
    {
      icon: FileText,
      color: 'text-cyan-600 dark:text-cyan-400',
      bgColor: 'bg-cyan-500/10 border-cyan-500/20 dark:border-cyan-500/10',
      title: 'Allowed Formats',
      description: 'PDF Documents (.pdf) and Plain Text (.txt) files only.',
    },
    {
      icon: CheckCircle2,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-500/10 border-emerald-500/20 dark:border-emerald-500/10',
      title: 'File Size Limit',
      description: 'Maximum 5 MB per individual file upload.',
    },
    {
      icon: ShieldAlert,
      color: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-500/10 border-indigo-500/20 dark:border-indigo-500/10',
      title: 'Upload Concurrency',
      description: 'Max 5 concurrent active uploads or document processing jobs.',
    },
    {
      icon: AlertTriangle,
      color: 'text-violet-600 dark:text-violet-400',
      bgColor: 'bg-violet-500/10 border-violet-500/20 dark:border-violet-500/10',
      title: 'Storage Quota',
      description: 'Up to 50 MB total cumulative storage limit per user session.',
    },
  ];

  return (
    <div className="w-full flex flex-col space-y-6 font-sans select-none">
      {/* Onboarding Intro Panel */}
      <div className="glass-panel p-6 rounded-2xl w-full flex flex-col md:flex-row items-start gap-6 relative overflow-hidden shadow-lg border border-card-border/50">
        {/* Abstract Background Glow */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-primary/5 to-accent/5 rounded-full blur-3xl pointer-events-none" />

        {/* Upload Call-to-Action Illustration */}
        <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-gradient-to-tr from-primary to-accent text-white flex items-center justify-center shadow-glow">
          <UploadCloud className="w-8 h-8" />
        </div>

        {/* Onboarding Texts */}
        <div className="flex-1 text-left space-y-2.5 z-10">
          <h2 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-700 via-teal-700 to-indigo-700 dark:from-cyan-400 dark:via-teal-400 dark:to-indigo-400">
            Welcome to the Document Intelligence Hub
          </h2>
          <p className="text-sm md:text-base leading-relaxed text-muted font-medium">
            Upload text documents or PDF files to start indexing. Once parsed, the Retrieval-Augmented Generation (RAG) engine will let you query, search, and extract citations in real-time.
          </p>
        </div>
      </div>

      {/* Constraints Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        {guidelines.map((guide, idx) => {
          const Icon = guide.icon;
          return (
            <div
              key={idx}
              className="glass-panel p-5 rounded-xl border border-card-border/40 hover:border-cyan-500/20 hover:bg-slate-900/5 dark:hover:bg-slate-900/40 transition-all flex items-start space-x-4 group"
            >
              <div className={`p-2.5 rounded-lg border flex-shrink-0 ${guide.bgColor} ${guide.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                  {guide.title}
                </h3>
                <p className="text-sm text-muted leading-relaxed font-medium">
                  {guide.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
