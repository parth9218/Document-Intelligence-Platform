'use client';

import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { LayoutDashboard, ExternalLink, ChevronLeft, ChevronRight, Cpu } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

export function Sidebar() {
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed);
  const pathname = usePathname();

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const navItems = [
    {
      name: 'Dashboard',
      href: '/',
      icon: LayoutDashboard,
    },
    {
      name: 'Sandbox UI',
      href: '/sandbox',
      icon: Cpu,
    },
  ];

  return (
    <aside
      className={`fixed top-0 left-0 z-40 h-screen transition-all duration-300 ease-in-out border-r border-card-border/40 bg-card/85 backdrop-blur-md flex flex-col overflow-x-hidden ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Sidebar Header Brand */}
      <div className={`flex items-center h-16 border-b border-card-border/40 px-4 justify-center`}>
        {sidebarCollapsed ? (
          <button
            onClick={toggleSidebar}
            className="group/btn flex items-center justify-center rounded-lg border border-card-border/40 shadow-glow hover:scale-105 transition-all cursor-pointer relative w-8 h-8 overflow-hidden bg-slate-900"
            title="Expand Sidebar"
          >
            <Image
              src="/logo.png"
              alt="DOCINTEL Logo"
              width={32}
              height={32}
              className="w-full h-full object-cover transition-all duration-300 transform scale-100 group-hover/btn:scale-0 group-hover/btn:opacity-0"
            />
            <ChevronRight className="w-5 h-5 text-cyan-400 transition-all duration-300 transform scale-0 opacity-0 group-hover/btn:scale-100 group-hover/btn:opacity-100 absolute z-10" />
          </button>
        ) : (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center space-x-2 overflow-hidden">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg overflow-hidden border border-card-border/40 shadow-glow flex items-center justify-center bg-slate-900">
                <Image
                  src="/logo.png"
                  alt="DOCINTEL Logo"
                  width={32}
                  height={32}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-sm font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-indigo-400 font-sans whitespace-nowrap">
                DOCINTEL
              </span>
            </div>
            <button
              onClick={toggleSidebar}
              className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-card-border/30 transition-all cursor-pointer"
              title="Collapse Sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center p-2.5 rounded-lg text-sm font-medium transition-all group relative cursor-pointer ${
                sidebarCollapsed ? 'justify-center' : 'space-x-3'
              } ${
                isActive
                  ? 'bg-primary/10 text-cyan-400 border border-primary/20 shadow-sm'
                  : 'text-muted hover:text-foreground hover:bg-card-border/20 border border-transparent'
              }`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-cyan-400' : 'text-muted group-hover:text-foreground'}`} />
              {!sidebarCollapsed && <span className="whitespace-nowrap">{item.name}</span>}
              {sidebarCollapsed && (
                <div className="absolute left-14 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950/95 border border-card-border/50 text-white text-[11px] px-2.5 py-1.5 rounded shadow-xl whitespace-nowrap z-50">
                  {item.name}
                </div>
              )}
            </Link>
          );
        })}

        {/* External API Docs Link */}
        <a
          href="http://localhost:3000/api-docs"
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center p-2.5 rounded-lg text-sm font-medium transition-all group relative text-muted hover:text-foreground hover:bg-card-border/20 border border-transparent cursor-pointer ${
            sidebarCollapsed ? 'justify-center' : 'space-x-3'
          }`}
        >
          <ExternalLink className="w-5 h-5 flex-shrink-0 text-muted group-hover:text-foreground" />
          {!sidebarCollapsed && <span className="whitespace-nowrap">Swagger API Docs</span>}
          {sidebarCollapsed && (
            <div className="absolute left-14 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950/95 border border-card-border/50 text-white text-[11px] px-2.5 py-1.5 rounded shadow-xl whitespace-nowrap z-50">
              Swagger API Docs
            </div>
          )}
        </a>
      </nav>
    </aside>
  );
}
