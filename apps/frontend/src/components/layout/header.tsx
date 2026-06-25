'use client';

import React, { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/hooks/useAuth';
import { Sun, Moon, Monitor, Shield, RefreshCw } from 'lucide-react';

export function Header() {
  const { activeSession, loading, error } = useAuth();
  const themeMode = useAppStore((state) => state.themeMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);

  // Sync theme to root html element
  useEffect(() => {
    const root = window.document.documentElement;
    if (themeMode === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.setAttribute('data-theme', systemTheme);
    } else {
      root.setAttribute('data-theme', themeMode);
    }
  }, [themeMode]);

  const truncateUuid = (uuid: string) => {
    if (!uuid) return '';
    return `${uuid.slice(0, 8)}...${uuid.slice(-4)}`;
  };

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-card-border/40 bg-card/70 backdrop-blur-md px-6 flex items-center justify-between">
      {/* Page Title / Left Column */}
      <div className="flex items-center space-x-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted select-none">
          Document Intelligence Console
        </span>
      </div>

      {/* Right Column (Auth Status & Theme Selector) */}
      <div className="flex items-center space-x-4">
        {/* Session Auth Status */}
        <div className="flex items-center space-x-2.5 px-3 py-1.5 rounded-lg bg-background/50 border border-card-border/30 text-xs shadow-inner">
          <Shield className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
          {loading ? (
            <div className="flex items-center space-x-1.5 text-muted">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Checking token...</span>
            </div>
          ) : error ? (
            <span className="text-rose-600 dark:text-rose-400 font-medium font-sans">Error: Session Failed</span>
          ) : activeSession ? (
            <div className="flex items-center space-x-2">
              <span className="font-mono text-cyan-600 dark:text-cyan-400 font-semibold tracking-wide">
                {truncateUuid(activeSession.id)}
              </span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          ) : (
            <span className="text-muted">No Session</span>
          )}
        </div>

        {/* Theme Toggler Buttons */}
        <div className="flex bg-background/60 p-0.5 rounded-lg border border-card-border/40">
          <button
            onClick={() => setThemeMode('light')}
            className={`p-1.5 rounded-md transition-all cursor-pointer ${
              themeMode === 'light'
                ? 'bg-card text-amber-500 shadow-sm'
                : 'text-muted hover:text-foreground'
            }`}
            title="Light Theme"
          >
            <Sun className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setThemeMode('dark')}
            className={`p-1.5 rounded-md transition-all cursor-pointer ${
              themeMode === 'dark'
                ? 'bg-card text-cyan-400 shadow-sm'
                : 'text-muted hover:text-foreground'
            }`}
            title="Dark Theme"
          >
            <Moon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setThemeMode('system')}
            className={`p-1.5 rounded-md transition-all cursor-pointer ${
              themeMode === 'system'
                ? 'bg-card text-indigo-400 shadow-sm'
                : 'text-muted hover:text-foreground'
            }`}
            title="System Theme"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
