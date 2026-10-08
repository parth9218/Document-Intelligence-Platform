'use client';

import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Sidebar } from './sidebar';
import { Header } from './header';

export function AppShell({ children }: { children: React.ReactNode }) {
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Fixed Sidebar Navigation */}
      <Sidebar />

      {/* Main Panel Content Frame */}
      <div
        className={`flex flex-col flex-1 min-h-screen transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? 'ml-16' : 'ml-64'
        }`}
      >
        {/* Header Console */}
        <Header />

        {/* Dynamic Page Views */}
        <main className="flex-1 flex flex-col p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
