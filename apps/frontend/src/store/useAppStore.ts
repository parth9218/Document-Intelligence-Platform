import { create } from 'zustand';
import { type DocumentStatusObject, type SessionResponse } from '../types/api';

export interface LocalProgressState {
  filename: string;
  progressPct: number;
  status: 'initializing' | 'uploading' | 'confirming' | 'uploaded' | 'failed';
  error?: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';

interface AppState {
  // Session State
  activeSession: SessionResponse | null;
  setActiveSession: (session: SessionResponse | null) => void;

  // Documents State
  documentRegistry: Record<string, DocumentStatusObject>;
  setDocumentRegistry: (registry: Record<string, DocumentStatusObject>) => void;
  updateDocumentStatus: (documentId: string, statusObj: DocumentStatusObject) => void;
  clearDocumentRegistry: () => void;

  // Uploads State
  localProgressQueue: Record<string, LocalProgressState>;
  setLocalProgress: (fileId: string, progressState: LocalProgressState) => void;
  updateLocalProgressPct: (fileId: string, progressPct: number) => void;
  clearLocalProgress: (fileId: string) => void;
  clearAllLocalProgress: () => void;

  // UI State
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Session
  activeSession: null,
  setActiveSession: (session) => set({ activeSession: session }),

  // Documents
  documentRegistry: {},
  setDocumentRegistry: (registry) => set({ documentRegistry: registry }),
  updateDocumentStatus: (documentId, statusObj) =>
    set((state) => ({
      documentRegistry: {
        ...state.documentRegistry,
        [documentId]: statusObj,
      },
    })),
  clearDocumentRegistry: () => set({ documentRegistry: {} }),

  // Uploads
  localProgressQueue: {},
  setLocalProgress: (fileId, progressState) =>
    set((state) => ({
      localProgressQueue: {
        ...state.localProgressQueue,
        [fileId]: progressState,
      },
    })),
  updateLocalProgressPct: (fileId, progressPct) =>
    set((state) => ({
      localProgressQueue: {
        ...state.localProgressQueue,
        [fileId]: state.localProgressQueue[fileId]
          ? { ...state.localProgressQueue[fileId], progressPct }
          : { filename: 'Unknown', progressPct, status: 'uploading' },
      },
    })),
  clearLocalProgress: (fileId) =>
    set((state) => {
      const nextQueue = { ...state.localProgressQueue };
      delete nextQueue[fileId];
      return { localProgressQueue: nextQueue };
    }),
  clearAllLocalProgress: () => set({ localProgressQueue: {} }),

  // UI
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  themeMode: 'system',
  setThemeMode: (mode) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme-preference', mode);
    }
    set({ themeMode: mode });
  },
}));
