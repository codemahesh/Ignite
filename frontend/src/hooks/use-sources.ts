import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import type { SourceStatus } from '@/types/api';

interface SourcesState {
  sources: SourceStatus[];
  totalArtifacts: number;
  activeSources: string[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to fetch source status for the coverage line
 * "Answering from 47 artifacts across Seed + Jira"
 */
export function useSources(pollInterval = 60000) {
  const [state, setState] = useState<SourcesState>({
    sources: [],
    totalArtifacts: 0,
    activeSources: [],
    isLoading: true,
    error: null,
  });

  const fetchSources = useCallback(async () => {
    try {
      const sources = await api.sources();
      
      const totalArtifacts = sources.reduce((sum, s) => sum + s.artifact_count, 0);
      const activeSources = sources
        .filter(s => s.status === 'synced' || s.status === 'degraded')
        .map(s => s.source);

      setState({
        sources,
        totalArtifacts,
        activeSources,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof ApiError ? error.message : 'Failed to load sources',
      }));
    }
  }, []);

  useEffect(() => {
    fetchSources();
    if (pollInterval > 0) {
      const interval = setInterval(fetchSources, pollInterval);
      return () => clearInterval(interval);
    }
  }, [fetchSources, pollInterval]);

  return { ...state, refresh: fetchSources };
}
