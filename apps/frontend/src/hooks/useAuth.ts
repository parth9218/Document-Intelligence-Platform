import { useState, useEffect, useCallback } from 'react';
import { apiClient, UnauthorizedError } from '../lib/api-client';
import { useAppStore } from '../store/useAppStore';
import { apiRouting } from '../config/api-routing';
import { type SessionResponse } from '../types/api';

export function useAuth() {
  const activeSession = useAppStore((state) => state.activeSession);
  const setActiveSession = useAppStore((state) => state.setActiveSession);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Query active session details
      const session = await apiClient<SessionResponse>('session', '/api/session');
      setActiveSession(session);
    } catch (err) {
      if (err instanceof UnauthorizedError && apiRouting.session === 'api') {
        try {
          // 2. Trigger session creation by querying a protected endpoint
          await apiClient('documents', '/api/documents/status');
          // 3. Re-query session details once the cookie is set
          const session = await apiClient<SessionResponse>('session', '/api/session');
          setActiveSession(session);
        } catch (createErr: unknown) {
          setError(createErr instanceof Error ? createErr.message : 'Failed to establish session');
          setActiveSession(null);
        }
      } else {
        setError(err instanceof Error ? err.message : 'Unknown authentication error');
        setActiveSession(null);
      }
    } finally {
      setLoading(false);
    }
  }, [setActiveSession]);

  useEffect(() => {
    let active = true;
    setTimeout(() => {
      if (active) {
        checkSession();
      }
    }, 0);
    return () => {
      active = false;
    };
  }, [checkSession]);

  return {
    activeSession,
    loading,
    error,
    checkSession,
  };
}
