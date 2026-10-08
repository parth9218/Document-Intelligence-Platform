import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const [coords, setCoords] = useState<{ top: number; left: number; flip: boolean }>({
    top: 0,
    left: 0,
    flip: false,
  });

  const badgeRef = useRef<HTMLButtonElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const citation = citations?.find((c) => c.index === citationIndex) || {
    index: citationIndex,
    filename: contextChunks?.[citationIndex - 1]?.filename || 'Document',
    pageNumber: contextChunks?.[citationIndex - 1]?.pageNumber ?? null,
  };

  const chunk = contextChunks?.[citationIndex - 1];

  const updatePosition = () => {
    if (!badgeRef.current) return;
    const rect = badgeRef.current.getBoundingClientRect();
    const popoverWidth = 320; // w-80
    const popoverHeight = 180; // approximate height

    // If near the top of viewport, flip popover to render BELOW the badge link!
    const shouldFlip = rect.top < 220;
    const top = shouldFlip ? rect.bottom + 8 : rect.top - popoverHeight - 8;

    // Center horizontally relative to badge link, clamped inside screen edges
    let left = rect.left + rect.width / 2 - popoverWidth / 2;
    left = Math.max(16, Math.min(left, window.innerWidth - popoverWidth - 16));

    setCoords({ top, left, flip: shouldFlip });
  };

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    updatePosition();
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 250);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen((prev) => !prev);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) {
      setIsOpen(false);
    }
  };

  // Recalculate position on scroll or resize when open
  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  const popoverId = `citation-popover-${citationIndex}`;
  const badgeId = `citation-badge-${citationIndex}`;

  return (
    <span
      className="relative inline-block mx-1 align-baseline"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
    >
      <button
        id={badgeId}
        ref={badgeRef}
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

      {/* Render popover via React Portal directly into document.body to prevent clipping by overflow-y-auto containers */}
      {isOpen && typeof window !== 'undefined' &&
        createPortal(
          <div
            id={popoverId}
            role="dialog"
            aria-labelledby={badgeId}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 99999,
            }}
            className="pointer-events-auto"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <SourcePopover citation={citation} chunk={chunk} />
          </div>,
          document.body,
        )}
    </span>
  );
};
