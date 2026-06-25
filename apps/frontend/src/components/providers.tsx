'use client';

import React, { useEffect, useState } from 'react';
import { apiRouting } from '@/config/api-routing';
import { ToastProvider } from '@/components/ui/toast';

export function Providers({ children }: { children: React.ReactNode }) {
  const [mswReady, setMswReady] = useState(false);

  useEffect(() => {
    async function initMsw() {
      // Check if any route mode is set to mock
      const hasMock = Object.values(apiRouting).some((mode) => mode === 'mock');
      
      if (process.env.NEXT_ENV === 'development' && hasMock) {
        try {
          const { worker } = await import('@/mocks/browser');
          await worker.start({
            onUnhandledRequest: 'bypass',
            serviceWorker: {
              url: '/mockServiceWorker.js',
            }
          });
        } catch (err) {
          console.error('MSW failed to start', err);
        }
      }
      setMswReady(true);
    }
    
    initMsw();
  }, []);

  if (!mswReady) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#070b13] text-cyan-400 font-sans">
        <div className="flex flex-col items-center space-y-4">
          <svg className="animate-spin h-8 w-8 text-cyan-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm font-medium tracking-wide">Initializing secure gateway...</span>
        </div>
      </div>
    );
  }

  return <ToastProvider>{children}</ToastProvider>;
}
