import React, { useState } from 'react';
import { type SearchResultChunk } from '@/types/api';
import { Layers, ChevronDown, ChevronUp, FileText, MapPin, Sparkles } from 'lucide-react';

interface SourceAccordionProps {
  chunks?: SearchResultChunk[];
}

export const SourceAccordion: React.FC<SourceAccordionProps> = ({ chunks }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!chunks || chunks.length === 0) return null;

  const accordionId = `source-accordion-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div className="mt-4 pt-3.5 border-t border-slate-200 dark:border-slate-800 font-sans text-xs">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        aria-controls={accordionId}
        className="flex items-center justify-between w-full py-2 px-3 rounded-xl border transition-all cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/40
          bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200
          dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
      >
        <div className="flex items-center space-x-2 font-semibold">
          <Layers className="w-4 h-4 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
          <span>Retrieved Context Sources ({chunks.length})</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
        )}
      </button>

      {isExpanded && (
        <div id={accordionId} className="mt-3 space-y-2.5">
          {chunks.map((chunk, index) => {
            const relevancePct = Math.max(0, Math.round((1 - chunk.distance) * 100));
            return (
              <div
                key={chunk.id || index}
                className="p-3.5 rounded-xl border space-y-2.5 shadow-sm
                  bg-white text-slate-900 border-slate-200
                  dark:bg-slate-950 dark:text-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center space-x-2 font-semibold text-slate-900 dark:text-slate-100 truncate">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold border shadow-xs
                      bg-cyan-100 text-cyan-800 border-cyan-300
                      dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-700">
                      [{index + 1}]
                    </span>
                    <FileText className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 flex-shrink-0" aria-hidden="true" />
                    <span className="truncate">{chunk.filename}</span>
                  </div>
                  <div className="flex items-center space-x-3 text-slate-600 dark:text-slate-300 text-[10px] font-medium">
                    <span className="flex items-center space-x-1">
                      <MapPin className="w-3 h-3 text-slate-400" aria-hidden="true" />
                      <span>Page {chunk.pageNumber ?? 'N/A'}</span>
                    </span>
                    <span className="flex items-center space-x-1 text-emerald-700 dark:text-emerald-400 font-mono font-semibold">
                      <Sparkles className="w-3 h-3 text-emerald-500" aria-hidden="true" />
                      <span>{relevancePct}% Match</span>
                    </span>
                  </div>
                </div>
                <p className="text-[11px] leading-relaxed font-mono p-2.5 rounded-lg border italic
                  bg-slate-50 text-slate-800 border-slate-200
                  dark:bg-slate-900 dark:text-slate-200 dark:border-slate-800">
                  "{chunk.content}"
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
