'use client';

import React, { useState, useEffect } from 'react';
import { apiRouting, type ApiRoutingConfig, type EndpointMode } from '@/config/api-routing';
import { RefreshCw, Terminal, X, Database } from 'lucide-react';

export function DevToolbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<ApiRoutingConfig>(() => ({ ...apiRouting }));
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    let active = true;
    setTimeout(() => {
      if (active) {
        setIsMounted(true);
      }
    }, 0);
    return () => {
      active = false;
    };
  }, []);

  if (!isMounted || process.env.NODE_ENV === 'production') {
    return null;
  }

  const handleModeChange = (endpoint: keyof ApiRoutingConfig, mode: EndpointMode) => {
    if (!config) return;
    const newConfig = { ...config, [endpoint]: mode };
    setConfig(newConfig);
    
    // Mutate the configuration object immediately
    apiRouting[endpoint] = mode;
    
    // Save to localStorage
    localStorage.setItem('api_routing_config', JSON.stringify(newConfig));
  };

  const handleSetAll = (mode: EndpointMode) => {
    if (!config) return;
    const newConfig: ApiRoutingConfig = {
      session: mode,
      documents: mode,
      progress: mode,
      query: mode,
    };
    setConfig(newConfig);

    // Mutate all properties
    Object.keys(apiRouting).forEach((key) => {
      const endpointKey = key as keyof ApiRoutingConfig;
      apiRouting[endpointKey] = mode;
    });

    localStorage.setItem('api_routing_config', JSON.stringify(newConfig));
  };

  const handleReset = () => {
    localStorage.removeItem('api_routing_config');
    window.location.reload();
  };

  const hasChanges = () => {
    if (!config) return false;
    const defaultMode = (process.env.NEXT_PUBLIC_API_MODE || 'hybrid') as 'api' | 'mock' | 'hybrid';
    const expectedDefault = defaultMode === 'api' ? 'api' : 'mock';
    return (
      config.session !== expectedDefault ||
      config.documents !== expectedDefault ||
      config.progress !== expectedDefault ||
      config.query !== expectedDefault
    );
  };

  if (!config) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] font-sans">
      {/* Collapsed Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center justify-center p-3 rounded-full bg-card border border-card-border text-cyan-600 dark:text-cyan-400 hover:scale-105 transition-all shadow-lg cursor-pointer"
          title="Developer Routing Controls"
        >
          <Database className="w-5 h-5 animate-pulse" />
        </button>
      )}

      {/* Expanded Control Panel */}
      {isOpen && (
        <div className="w-80 p-4 rounded-xl bg-card border border-card-border/80 text-foreground shadow-2xl flex flex-col space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-card-border/40 pb-2">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span className="text-sm font-semibold tracking-wide uppercase text-foreground">
                Gateway Router
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Presets:</span>
            <div className="flex space-x-2">
              <button
                onClick={() => handleSetAll('api')}
                className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors cursor-pointer"
              >
                All API
              </button>
              <button
                onClick={() => handleSetAll('mock')}
                className="px-2 py-1 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/25 transition-colors cursor-pointer"
              >
                All Mock
              </button>
            </div>
          </div>

          {/* Routes Grid */}
          <div className="flex flex-col space-y-2">
            {(Object.keys(config) as Array<keyof ApiRoutingConfig>).map((endpoint) => (
              <div
                key={endpoint}
                className="flex items-center justify-between bg-background/40 p-2 rounded border border-card-border/30"
              >
                <span className="text-xs font-mono text-muted capitalize">{endpoint}</span>
                <div className="flex bg-background/80 rounded p-0.5 border border-card-border/40">
                  <button
                    onClick={() => handleModeChange(endpoint, 'api')}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-all cursor-pointer ${
                      config[endpoint] === 'api'
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    API
                  </button>
                  <button
                    onClick={() => handleModeChange(endpoint, 'mock')}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-all cursor-pointer ${
                      config[endpoint] === 'mock'
                        ? 'bg-indigo-500 text-white shadow-sm'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    MOCK
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-between pt-2 border-t border-card-border/40 text-xs">
            <button
              onClick={() => window.location.reload()}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/25 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Apply & Reload</span>
            </button>
            {hasChanges() && (
              <button
                onClick={handleReset}
                className="px-2.5 py-1.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/25 transition-colors cursor-pointer"
              >
                Reset Default
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
