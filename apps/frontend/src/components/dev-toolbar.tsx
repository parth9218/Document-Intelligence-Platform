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
          className="flex items-center justify-center p-3 rounded-full bg-slate-900/90 border border-slate-700/50 text-cyan-400 hover:text-cyan-300 hover:scale-105 transition-all shadow-lg backdrop-blur-md cursor-pointer"
          title="Developer Routing Controls"
        >
          <Database className="w-5 h-5 animate-pulse" />
        </button>
      )}

      {/* Expanded Control Panel */}
      {isOpen && (
        <div className="w-80 p-4 rounded-xl bg-slate-950/95 border border-cyan-500/30 text-white shadow-2xl backdrop-blur-lg flex flex-col space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-semibold tracking-wide uppercase text-slate-200">
                Gateway Router
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Presets:</span>
            <div className="flex space-x-2">
              <button
                onClick={() => handleSetAll('api')}
                className="px-2 py-1 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-900/40 transition-colors cursor-pointer"
              >
                All API
              </button>
              <button
                onClick={() => handleSetAll('mock')}
                className="px-2 py-1 rounded bg-purple-950/40 text-purple-400 border border-purple-500/20 hover:bg-purple-900/40 transition-colors cursor-pointer"
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
                className="flex items-center justify-between bg-slate-900/40 p-2 rounded border border-slate-800/60"
              >
                <span className="text-xs font-mono text-slate-300 capitalize">{endpoint}</span>
                <div className="flex bg-slate-950 rounded p-0.5 border border-slate-800">
                  <button
                    onClick={() => handleModeChange(endpoint, 'api')}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
                      config[endpoint] === 'api'
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    API
                  </button>
                  <button
                    onClick={() => handleModeChange(endpoint, 'mock')}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
                      config[endpoint] === 'mock'
                        ? 'bg-purple-500 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    MOCK
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[10px]">
            <button
              onClick={() => window.location.reload()}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded bg-cyan-950/40 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-900/40 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Apply & Reload</span>
            </button>
            {hasChanges() && (
              <button
                onClick={handleReset}
                className="px-2.5 py-1.5 rounded bg-rose-950/40 text-rose-400 border border-rose-500/20 hover:bg-rose-900/40 transition-colors cursor-pointer"
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
