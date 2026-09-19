import { useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import type {
  SourceReference,
  RelationshipPath,
  Contradiction,
  WebResult,
} from '@/types/api';

interface AskState {
  // Loading states
  isLoading: boolean;
  isLoadingDetails: boolean;
  
  // Error states
  error: string | null;
  detailsError: string | null;
  
  // Response data
  answer: string | null;
  traceId: string | null;
  sources: SourceReference[];
  webResults: WebResult[];
  
  // Details data (loaded separately)
  path: RelationshipPath | null;
  contradiction: Contradiction | null;
  
  // Meta
  isCached: boolean;
}

const initialState: AskState = {
  isLoading: false,
  isLoadingDetails: false,
  error: null,
  detailsError: null,
  answer: null,
  traceId: null,
  sources: [],
  webResults: [],
  path: null,
  contradiction: null,
  isCached: false,
};

/**
 * Hook for the two-phase ask flow:
 * 1. POST /ask returns answer + trace_id quickly
 * 2. GET /ask/{trace_id}/details returns path + contradiction
 */
export function useAsk() {
  const [state, setState] = useState<AskState>(initialState);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const ask = useCallback(async (question: string, useWebSearch = false) => {
    setState(prev => ({
      ...prev,
      isLoading: true,
      isLoadingDetails: true,
      error: null,
      detailsError: null,
      answer: null,
      traceId: null,
      sources: [],
      webResults: [],
      path: null,
      contradiction: null,
      isCached: false,
    }));

    try {
      // Phase 1: Get answer (fast path)
      const response = await api.ask(question, useWebSearch);

      setState(prev => ({
        ...prev,
        isLoading: false,
        answer: response.answer,
        traceId: response.trace_id,
        sources: response.sources as SourceReference[],
        webResults: (response.web_results || []) as WebResult[],
      }));

      // Phase 2: Get details (slow path) - don't await, let it complete in background
      fetchDetails(response.trace_id);

    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        isLoadingDetails: false,
        error: error instanceof ApiError ? error.message : 'Failed to get answer',
      }));
    }
  }, []);

  const fetchDetails = async (traceId: string) => {
    try {
      const details = await api.askDetails(traceId);

      setState(prev => ({
        ...prev,
        isLoadingDetails: false,
        path: details.path as RelationshipPath | null,
        contradiction: details.contradiction as Contradiction | null,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoadingDetails: false,
        detailsError: error instanceof ApiError ? error.message : 'Failed to load details',
      }));
    }
  };

  return {
    ...state,
    ask,
    reset,
  };
}
