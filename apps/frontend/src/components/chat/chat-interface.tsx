import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useQuery } from '@/hooks/useQuery';
import { ChatBubble } from './chat-bubble';
import {
  Send,
  Square,
  Trash2,
  Sparkles,
  MessageSquare,
  AlertCircle,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';

export const ChatInterface: React.FC = () => {
  const [queryInput, setQueryInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const chatMessages = useAppStore((state) => state.chatMessages);
  const { isStreaming, error, submitQuery, abortStream, clearChat } = useQuery();

  // Auto-scroll to bottom of chat as new tokens arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isStreaming]);

  // Adjust textarea height dynamically based on input content
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQueryInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!queryInput.trim() || isStreaming) return;
    submitQuery(queryInput);
    setQueryInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  return (
    <section
      aria-label="Grounded Document Chat"
      className="p-6 rounded-2xl flex-1 min-h-[620px] flex flex-col font-sans border shadow-xl transition-all
        bg-white text-slate-900 border-slate-200 shadow-slate-200/50
        dark:bg-slate-900/95 dark:text-slate-100 dark:border-slate-800 dark:shadow-black/60"
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border shadow-xs
            bg-cyan-100 text-cyan-800 border-cyan-300
            dark:bg-cyan-950 dark:text-cyan-400 dark:border-cyan-700/60">
            <Sparkles className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Grounded Document Q&A
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              Ask questions backed by verified document citations.
            </p>
          </div>
        </div>

        {chatMessages.length > 0 && (
          <button
            type="button"
            onClick={clearChat}
            disabled={isStreaming}
            aria-label="Clear chat conversation history"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs border transition-all cursor-pointer disabled:opacity-50 shadow-xs focus:outline-none focus:ring-2 focus:ring-rose-500/40
              bg-slate-100 text-slate-700 border-slate-300 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300
              dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 dark:hover:border-rose-800"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Clear Chat</span>
          </button>
        )}
      </div>

      {/* Messages Scroll Viewport */}
      <div
        tabIndex={0}
        aria-label="Chat messages history"
        className="flex-1 overflow-y-auto py-4 space-y-4 pr-2 custom-scrollbar focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
      >
        {chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6 my-auto py-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center border shadow-md
              bg-cyan-100 text-cyan-800 border-cyan-300
              dark:bg-cyan-950/80 dark:text-cyan-400 dark:border-cyan-700">
              <MessageSquare className="w-7 h-7" aria-hidden="true" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                No conversation started
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                Upload documents to your session and type a query below to generate answers grounded in your files.
              </p>
            </div>
          </div>
        ) : (
          <>
            {chatMessages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div role="alert" className="flex items-center space-x-2 p-3 mb-3 rounded-xl border text-xs font-semibold
          bg-red-50 text-red-800 border-red-300
          dark:bg-red-950/80 dark:text-red-300 dark:border-red-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Input Box Controls */}
      <div className="pt-3.5 border-t border-slate-200 dark:border-slate-800 space-y-2">
        <div className="relative flex items-center">
          <textarea
            ref={textareaRef}
            rows={1}
            value={queryInput}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            aria-label="Ask a question about your documents"
            placeholder={
              isStreaming
                ? 'Assistant is answering...'
                : 'Ask a question about your documents... (Enter to send, Shift+Enter for newline)'
            }
            disabled={isStreaming}
            className="w-full py-3.5 pl-4 pr-24 rounded-xl border text-sm font-sans font-medium transition-all resize-none shadow-inner disabled:opacity-60
              bg-slate-50 text-slate-900 border-slate-300 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20
              dark:bg-slate-950 dark:text-slate-100 dark:border-slate-700 dark:placeholder:text-slate-500 dark:focus:border-cyan-500 dark:focus:ring-cyan-500/30"
          />

          <div className="absolute right-2.5 flex items-center space-x-1.5">
            {isStreaming ? (
              <button
                type="button"
                onClick={abortStream}
                aria-label="Stop generating response"
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold border shadow-xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500/40
                  bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100
                  dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800 dark:hover:bg-rose-900/60"
              >
                <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!queryInput.trim()}
                aria-label="Send query"
                className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
