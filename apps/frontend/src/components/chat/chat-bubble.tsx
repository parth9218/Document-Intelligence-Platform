import React from 'react';
import { type ChatMessage } from '@/types/api';
import { CitationBadge } from './citation-badge';
import { SourceAccordion } from './source-accordion';
import { Bot, User, AlertCircle, Loader2 } from 'lucide-react';

interface ChatBubbleProps {
  message: ChatMessage;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';

  // Helper to parse [n] bracket citation patterns and replace with CitationBadge components
  const renderFormattedText = (text: string) => {
    if (!text) return null;

    const parts: React.ReactNode[] = [];
    const regex = /\[(\d+)\]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const matchIndex = match.index;
      const citationNumber = parseInt(match[1], 10);

      // Push text segment before citation
      if (matchIndex > lastIndex) {
        parts.push(text.slice(lastIndex, matchIndex));
      }

      // Push CitationBadge component
      parts.push(
        <CitationBadge
          key={`citation-${matchIndex}-${citationNumber}`}
          citationIndex={citationNumber}
          citations={message.citations}
          contextChunks={message.contextChunks}
        />,
      );

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  };

  if (isUser) {
    return (
      <div className="flex justify-end items-start space-x-3 mb-6">
        <div className="max-w-xl p-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md space-y-1.5 border border-indigo-400/30">
          <p className="text-sm font-sans font-medium leading-relaxed whitespace-pre-wrap text-white">
            {message.content}
          </p>
          <span className="block text-[10px] text-cyan-100/90 text-right font-mono font-medium">
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-md">
          <User className="w-4 h-4" aria-hidden="true" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start items-start space-x-3 mb-6">
      <div className="w-8 h-8 rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-700 flex items-center justify-center flex-shrink-0 shadow-sm">
        <Bot className="w-4 h-4" aria-hidden="true" />
      </div>

      <div className="max-w-2xl w-full p-5 rounded-2xl border space-y-3 font-sans shadow-lg transition-all
        bg-white text-slate-900 border-slate-200 shadow-slate-200/50
        dark:bg-slate-900/95 dark:text-slate-100 dark:border-slate-800 dark:shadow-black/60">
        
        {/* Error Banner */}
        {message.error && (
          <div role="alert" className="flex items-center space-x-2 p-3 rounded-xl border text-xs font-semibold
            bg-red-50 text-red-800 border-red-300
            dark:bg-red-950/80 dark:text-red-300 dark:border-red-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
            <span>{message.error}</span>
          </div>
        )}

        {/* Content Delta Text */}
        <div className="text-sm leading-relaxed font-normal text-slate-900 dark:text-slate-100 whitespace-pre-wrap">
          {renderFormattedText(message.content)}

          {!message.content && !message.isStreaming && (
            <span className="text-sm text-slate-600 dark:text-slate-300 italic">
              I couldn't find any relevant information in your uploaded documents to answer this question. Please ensure your documents are uploaded and processed, or try rephrasing your query.
            </span>
          )}

          {/* Streaming Cursor Indicator */}
          {message.isStreaming && (
            <span className="inline-flex items-center ml-1 space-x-1.5 text-cyan-600 dark:text-cyan-400 font-medium">
              <span className="inline-block w-2 h-4 bg-cyan-600 dark:bg-cyan-400 animate-pulse rounded-xs" />
              {!message.content && (
                <span className="text-xs text-slate-500 dark:text-slate-400 italic flex items-center space-x-1.5 font-sans">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Searching & generating answer...</span>
                </span>
              )}
            </span>
          )}
        </div>

        {/* Timestamp */}
        <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono font-medium">
          <span>Grounded AI Response</span>
          <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        {/* Source Accordion */}
        <SourceAccordion chunks={message.contextChunks} />
      </div>
    </div>
  );
};
