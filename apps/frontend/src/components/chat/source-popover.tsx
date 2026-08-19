import React from 'react';
import { type SearchResultChunk, type CitationMeta } from '@/types/api';
import { FileText, MapPin, Sparkles } from 'lucide-react';

interface SourcePopoverProps {
  citation: CitationMeta;
  chunk?: SearchResultChunk;
}

export const SourcePopover: React.FC<SourcePopoverProps> = ({ citation, chunk }) => {
  const relevancePct = chunk ? Math.max(0, Math.round((1 - chunk.distance) * 100)) : null;

  return (
    <div className="w-80 p-4 space-y-3 font-sans text-xs rounded-2xl shadow-2xl backdrop-blur-xl border transition-all z-[9999]
      bg-white text-slate-900 border-slate-300 shadow-slate-300/50
      dark:bg-slate-900/95 dark:text-slate-100 dark:border-slate-700/80 dark:shadow-black/70">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-2.5 border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-2 font-semibold truncate text-slate-900 dark:text-slate-100">
          <FileText className="w-4 h-4 text-cyan-600 dark:text-cyan-400 flex-shrink-0" aria-hidden="true" />
          <span className="truncate">{citation.filename}</span>
        </div>
        <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold border shadow-xs
          bg-cyan-100 text-cyan-800 border-cyan-300
          dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-700">
          [{citation.index}]
        </span>
      </div>

      {/* Page and Relevance Metadata */}
      <div className="flex items-center justify-between text-[11px] font-medium text-slate-600 dark:text-slate-300">
        <div className="flex items-center space-x-1.5">
          <MapPin className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          <span>Page {citation.pageNumber ?? 'N/A'}</span>
        </div>
        {relevancePct !== null && (
          <div className="flex items-center space-x-1 font-mono font-semibold text-emerald-700 dark:text-emerald-400">
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
            <span>{relevancePct}% Match</span>
          </div>
        )}
      </div>

      {/* Referenced Text Snippet */}
      {chunk ? (
        <div
          tabIndex={0}
          aria-label={`Source text snippet for citation [${citation.index}]`}
          className="p-3 rounded-xl border leading-relaxed max-h-36 overflow-y-auto italic text-[11px] font-mono custom-scrollbar focus:outline-none focus:ring-1 focus:ring-cyan-500/40
            bg-slate-50 text-slate-800 border-slate-200
            dark:bg-slate-950/80 dark:text-slate-200 dark:border-slate-800"
        >
          "{chunk.content}"
        </div>
      ) : (
        <div className="p-3 rounded-xl border text-[11px] italic
          bg-slate-50 text-slate-500 border-slate-200
          dark:bg-slate-950/50 dark:text-slate-400 dark:border-slate-800">
          Source snippet unavailable
        </div>
      )}
    </div>
  );
};
