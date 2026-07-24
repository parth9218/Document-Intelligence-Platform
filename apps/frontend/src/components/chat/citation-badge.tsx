import React, { useState, useRef } from 'react';
import { type SearchResultChunk, type CitationMeta } from '@/types/api';
import { SourcePopover } from './source-popover';

interface CitationBadgeProps {
  citationIndex: number;
  citations?: CitationMeta[];
  contextChunks?: SearchResultChunk[];
}

export const CitationBadge: React.FC<CitationBadgeProps> = ({
  citationIndex,
  citations,
  contextChunks,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const citation = citations?.find((c) => c.index === citationIndex) || {
    index: citationIndex,
    filename: contextChunks?.[citationIndex - 1]?.filename || 'Document',
    pageNumber: contextChunks?.[citationIndex - 1]?.pageNumber ?? null,
  };

  const chunk = contextChunks?.[citationIndex - 1];

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 250); // 250ms grace period allowing smooth cursor movement between link and popover card
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) {
      setIsOpen(false);
    }
  };

  const popoverId = `citation-popover-${citationIndex}`;
  const badgeId = `citation-badge-${citationIndex}`;

  return (
    <span
      className="relative inline-block mx-1 align-baseline group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
    >
      <button
        id={badgeId}
        type="button"
        onClick={handleClick}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={popoverId}
        aria-label={`Citation [${citationIndex}]: ${citation.filename}${citation.pageNumber ? `, Page ${citation.pageNumber}` : ''}`}
        className="inline-flex items-center justify-center px-2 py-0.5 rounded-md font-mono text-xs font-bold transition-all duration-150 cursor-pointer select-none border shadow-xs
          bg-cyan-100 text-cyan-900 border-cyan-300 hover:bg-cyan-200 hover:border-cyan-400
          dark:bg-cyan-950/80 dark:text-cyan-300 dark:border-cyan-700/80 dark:hover:bg-cyan-900/80 dark:hover:border-cyan-500
          focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
      >
        [{citationIndex}]
      </button>

      {isOpen && (
        <div
          id={popoverId}
          role="dialog"
          aria-labelledby={badgeId}
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 z-[9999] pointer-events-auto"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <SourcePopover citation={citation} chunk={chunk} />
        </div>
      )}
    </span>
  );
};
