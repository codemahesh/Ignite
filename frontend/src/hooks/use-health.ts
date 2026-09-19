import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';

export type SystemStatus = 'ready' | 'degraded' | 'down' | 'loading' | 'error';
export type { SystemStatus as SystemStatusType };

interface HealthState {
  status: SystemStatus;
  neo4j: boolean;
  postgres: boolean;
  cognee: boolean;
  details?: string;
  error?: string;
}

/**
 * Hook to monitor system health/readiness
 * Polls /ready endpoint to check all dependencies
 */
export function useHealth(pollInterval = 30000) {
  const [health, setHealth] = useState<HealthState>({
    status: 'loading',
    neo4j: false,
    postgres: false,
    cognee: false,
  });

  const checkHealth = useCallback(async () => {
    try {
      const result = await api.ready();
      setHealth({
        status: result.status,
        neo4j: result.neo4j,
        postgres: result.postgres,
        cognee: result.cognee,
        details: result.details,
        error: undefined,
      });
    } catch (error) {
      // If /ready fails, fall back to /health
      try {
        await api.health();
        setHealth({
          status: 'degraded',
          neo4j: false,
          postgres: false,
          cognee: false,
          error: error instanceof ApiError ? error.message : 'Unknown error',
        });
      } catch {
        setHealth({
          status: 'down',
          neo4j: false,
          postgres: false,
          cognee: false,
          error: 'Service unavailable',
        });
      }
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, pollInterval);
    return () => clearInterval(interval);
  }, [checkHealth, pollInterval]);

  return { ...health, refresh: checkHealth };
}
