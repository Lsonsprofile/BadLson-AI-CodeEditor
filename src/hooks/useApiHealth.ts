// src/hooks/useApiHealth.ts
import { useState, useEffect, useCallback, useRef } from 'react';

export type ApiHealthStatus = 'online' | 'offline' | 'unknown';

export interface UseApiHealthOptions {
  healthUrl?: string;
  pollingInterval?: number;
  autoStart?: boolean;
  requestTimeout?: number;
  onStatusChange?: (status: ApiHealthStatus) => void;
}

export interface UseApiHealthReturn {
  status: ApiHealthStatus;
  isChecking: boolean;
  lastChecked: Date | null;
  checkHealth: () => Promise<ApiHealthStatus>;
  startPolling: () => void;
  stopPolling: () => void;
  togglePolling: () => void;
  isPolling: boolean;
}

export function useApiHealth(options: UseApiHealthOptions = {}): UseApiHealthReturn {
  // ✅ FIXED: Get VITE_API_URL from import.meta.env
  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5002/api';
  
  const {
    healthUrl = `${apiBaseUrl}/health`,
    pollingInterval = 30000,
    autoStart = true,
    requestTimeout = 5000,
    onStatusChange,
  } = options;

  const [status, setStatus] = useState<ApiHealthStatus>('unknown');
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isPolling, setIsPolling] = useState(autoStart);

  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const checkHealth = useCallback(async (): Promise<ApiHealthStatus> => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsChecking(true);

    try {
      const timeoutId = setTimeout(() => {
        abortControllerRef.current?.abort();
      }, requestTimeout);

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: abortControllerRef.current.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      const newStatus: ApiHealthStatus = response.ok ? 'online' : 'offline';
      setStatus(newStatus);
      setLastChecked(new Date());
      onStatusChange?.(newStatus);
      return newStatus;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return status;
      }
      const newStatus: ApiHealthStatus = 'offline';
      setStatus(newStatus);
      setLastChecked(new Date());
      onStatusChange?.(newStatus);
      return newStatus;
    } finally {
      setIsChecking(false);
      abortControllerRef.current = null;
    }
  }, [healthUrl, requestTimeout, onStatusChange, status]);

  const startPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }

    checkHealth();

    pollingTimerRef.current = setInterval(() => {
      checkHealth();
    }, pollingInterval);

    setIsPolling(true);
  }, [pollingInterval, checkHealth]);

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const togglePolling = useCallback(() => {
    if (isPolling) {
      stopPolling();
    } else {
      startPolling();
    }
  }, [isPolling, stopPolling, startPolling]);

  useEffect(() => {
    if (autoStart) {
      startPolling();
    }
    return () => {
      stopPolling();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  return {
    status,
    isChecking,
    lastChecked,
    checkHealth,
    startPolling,
    stopPolling,
    togglePolling,
    isPolling,
  };
}

export default useApiHealth;