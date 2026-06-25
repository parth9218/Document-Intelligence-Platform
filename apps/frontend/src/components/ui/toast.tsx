'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toast: (options: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(({ type, title, message, duration = 4000 }: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, title, message, duration }]);

    if (duration > 0) {
      setTimeout(() => {
        dismiss(id);
      }, duration);
    }
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      
      {/* Toast container overlay */}
      <div 
        className="fixed bottom-4 right-4 z-50 flex flex-col space-y-3 max-w-md w-full sm:w-[380px]"
        aria-live="assertive"
        aria-atomic="true"
      >
        {toasts.map((t) => {
          return (
            <div
              key={t.id}
              className={cn(
                'glass-panel p-4 rounded-xl shadow-lg border flex items-start space-x-3 transition-all duration-300 transform translate-y-0 opacity-100 relative',
                {
                  'border-emerald-500/30 bg-emerald-950/10': t.type === 'success',
                  'border-red-500/30 bg-red-950/10': t.type === 'error',
                  'border-amber-500/30 bg-amber-950/10': t.type === 'warning',
                  'border-primary/30 bg-primary-glow/5': t.type === 'info',
                }
              )}
            >
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                {t.type === 'success' && <CheckCircle className="h-5 w-5 text-emerald-400" />}
                {t.type === 'error' && <AlertCircle className="h-5 w-5 text-red-400" />}
                {t.type === 'warning' && <AlertTriangle className="h-5 w-5 text-amber-400" />}
                {t.type === 'info' && <Info className="h-5 w-5 text-primary" />}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                {t.title && <h4 className="text-sm font-semibold text-foreground mb-0.5">{t.title}</h4>}
                <p className="text-xs text-muted leading-relaxed break-words">{t.message}</p>
              </div>

              {/* Close Button */}
              <button
                onClick={() => dismiss(t.id)}
                className="flex-shrink-0 text-muted hover:text-foreground p-0.5 rounded-lg hover:bg-white/5 cursor-pointer"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
